import {IConnectorClient} from "./IConnectorClient";
import {Client} from "gotti-channels/dist";
import {EventEmitter} from "events";
import {DataChannel, DescriptionType, RtcConfig, PeerConnection} from "node-datachannel";
import {Protocol} from "../Protocol";
const nodeDataChannel = require('node-datachannel');

type Signal = CandidateSignal | SdpSignal

export type CandidateSignal = {
    candidate: string,
    mid: string
}

export type SdpSignal = {
    sdp: string,
    type: string
}

type ReliableBufferLookup = {
    [seq: number]: {
        timeout: any,
        message: Buffer
    }
}
const msgpack = require('notepack.io');

export class WebRTCConnectorClient extends EventEmitter implements IConnectorClient {
    upgradeReq?: import("http").IncomingMessage;
    auth?: any;
    seatOptions?: any;
    public peerConnection : PeerConnection
    private localDescription : SdpSignal;
    private collectedCandidates : Array<CandidateSignal> = [];
    private collectedSdps : Array<SdpSignal> = [];
    private collectedSignals: Array<Signal> = [];
    private bufferedCandidates : Array<CandidateSignal> = [];
    private connected : boolean = false;
    private dataChannel : DataChannel;
    private sentReliableAckSequences : Array<number> = [];
    private sentOrderedAckSequences : Array<number> = [];

    private unorderedProcessedTimeouts : {[number: string]: any } = {};
    private prevUnorderedProcessedCounts : {[number: string]: number } = {};
    private enqueued: {
        'reliable': Array<Buffer | Array<any>>,
        'reliable_ordered': Array<Buffer | Array<any>>,
        'unreliable': Array<Buffer | Array<any>>,
    } = {reliable:[], reliable_ordered: [], unreliable: [] }

    private nextSequenceNumber : number = 0;
    private nextOrderedSequenceNumber : number = 0;
    private receivedOutOfOrderSeq: Array<{ seq: number, message: any }> = [];

    private lastAckSequenceNumber : number = 0;
    private lastAckOrderedSequenceNumber : number = 0;
    private orderedReliableBuffer : ReliableBufferLookup = {};
    private reliableBuffer : ReliableBufferLookup = {} ;
    private alreadyProcessedReliableSeqs : {[number: string]: any } = {};
    private lowestUnorderedSeqProcessed: number = 0;

    public hasAcks : boolean = false;

    constructor(gottiId: string, config: RtcConfig) {
        super();
        this.gottiId = gottiId;
        this.peerConnection = new nodeDataChannel.PeerConnection(gottiId, config);
        this.peerConnection.onStateChange(state => {
            console.log('state:', state);
        })
        this.peerConnection.onGatheringStateChange(state => {
            console.log('gathering state:', state)
        })
        this.peerConnection.onLocalDescription( (sdp, type) => {
            this.addSdp({ sdp, type });
        });
        this.peerConnection.onLocalCandidate((candidate: string, mid: string) => {
            this.addCandidate( { candidate, mid });
        });

        this.dataChannel = this.peerConnection.createDataChannel('gotticonnector', {
            negotiated: false,
            protocol: "udp",
            reliability: {rexmit: 0, type: 2, unordered: true},
        });

        this.dataChannel.onOpen(() => {
            this.connected = true;
            this.state = 'open';
            this.emit('opened-channel', this.dataChannel);
        });
        this.dataChannel.onClosed(() => {
            this.emit('closed-channel', 'closed');
        });
        this.dataChannel.onMessage(this._onMessage.bind(this));
    }
    channelClient: Client;
    close(reason: number | undefined): void {
        this.state = 'closed';
        this.enqueued = null;
        Object.keys(this.reliableBuffer).forEach(k => {
            clearTimeout(this.reliableBuffer[k].timeout);
        });
        Object.keys(this.orderedReliableBuffer).forEach(k => {
            clearTimeout(this.orderedReliableBuffer[k].timeout);
        });
        this.reliableBuffer = {};
        this.orderedReliableBuffer = {};
        try {
            this.dataChannel.close();
        } catch(err) {
        }
    }
    public sendReliable(message: Array<any>, ordered=false, opts?: { retryRate?: number, firstRetryRate?: number } ) {
        if(this.state !== 'open') {
            const queueName = ordered ? 'reliable_ordered' : 'reliable'
            this.enqueued[queueName].push(message);
            return;
        }
        let seq;
        opts = opts || {};
        let lookup : ReliableBufferLookup;
        if(ordered) {
            if(++this.nextOrderedSequenceNumber >= 65535) { this.nextOrderedSequenceNumber = 1; }
            seq = this.nextOrderedSequenceNumber;
            lookup = this.orderedReliableBuffer;
        } else {
            if(++this.nextSequenceNumber >= 65535) { this.nextSequenceNumber = 1;}
            seq = this.nextSequenceNumber;
            lookup = this.reliableBuffer;
        }
        const buffer = msgpack.encode([...message, seq]);
        this._sendReliable(buffer, lookup, seq, 0, { retryRate: opts.retryRate, firstRetryRate: opts.retryRate })
    }
    send(message: Buffer, options?: { retryRate?: number, firstRetryRate?: number }): void {
        if(this.state !== 'open') {
            this.enqueued.unreliable.push(message);
            return;
        }
        this.dataChannel.sendMessageBinary(message as Buffer);
    }

    private _sendReliable(message: Buffer, lookup: ReliableBufferLookup, seq: number, retry: number, opts?: { retryRate?: number, firstRetryRate?: number }) {
        opts = opts || {};
        const retryRate = opts.retryRate || 5;
        if(retry === 0) {
            const firstRetryRate = opts.firstRetryRate || retryRate;
            lookup[seq] = {
                message,
                timeout: setTimeout(() => {
                    this._sendReliable(message, lookup, seq,1, { retryRate });
                }, firstRetryRate),
            }
        } else {
            lookup[seq].timeout = setTimeout(() => {
                this._sendReliable(message, lookup, seq,++retry, { retryRate });
            }, retryRate);
        }
        this.dataChannel.sendMessageBinary(message);
    }

    public receivedAcks(awaitingReliable: Array<number>, awaitingOrdered: Array<number>) {
        awaitingReliable.forEach(ack => {
            this.ackReliable(ack);
        })
        awaitingOrdered.forEach(ack => {
            this.ackReliableOrdered(ack);
        })
    }

    public ackReliable(seq: number) {
        if(this.reliableBuffer[seq]) {
            clearTimeout(this.reliableBuffer[seq].timeout);
            delete this.reliableBuffer[seq];
        }
    }
    public ackReliableOrdered(seq: number) {
        if(this.orderedReliableBuffer[seq]) {
            clearTimeout(this.orderedReliableBuffer[seq].timeout);
            delete this.orderedReliableBuffer[seq];
        }
    }

    public sendAcks() : boolean {
        if(this.hasAcks) {
            this.send(msgpack.encode([Protocol.ACK_SYNC, ...this.sentOrderedAckSequences], [...this.sentReliableAckSequences]));
            this.sentOrderedAckSequences.length = 0;
            this.sentReliableAckSequences.length = 0;
            this.hasAcks = false;
            return true;
        }
        return false;
    }

    private _onMessage(msg: Buffer)  {
        const decoded = msgpack.decode(msg);
        const msgType = decoded[0];
        if(msgType === Protocol.ACK_SYNC) {
            this.receivedAcks(decoded.slice(1, decoded.length-1), decoded.pop());
        } else {
            if(msgType <= 5) {
                // unordered message, no acks needed, emit and return..
                return this.emit('message', decoded);
            }
            this.hasAcks = true;
            const seq = decoded.pop();
            if (msgType < 12) { // 12 is max reliable protocol
                // track that its a seq we need to send, then emit the decoded message.
                !this.sentReliableAckSequences.includes(seq) && this.sentReliableAckSequences.push(seq);
                if(seq > this.lowestUnorderedSeqProcessed && !this.alreadyProcessedReliableSeqs[seq]) {
                    this.alreadyProcessedReliableSeqs[seq] = true;
                    this.emit('message', decoded);
                    while(this.alreadyProcessedReliableSeqs[this.lowestUnorderedSeqProcessed+1]) {
                        delete this.alreadyProcessedReliableSeqs[++this.lowestUnorderedSeqProcessed]
                    }
                }
            } else { // 12 is max reliable ordered protocol
                !this.sentOrderedAckSequences.includes(seq) && this.sentOrderedAckSequences.push(seq);

                // todo: check if we went over the 65535 max meaning the seq reset.
                if(seq <= this.lastAckSequenceNumber) return;

                // we received the next needed ack sequence.
                if(this.lastAckSequenceNumber === seq-1) {
                    this.lastAckSequenceNumber = seq;
                    this.emit('message', decoded);
                    // do callback for all sequences we already received.
                    while(this.receivedOutOfOrderSeq.length && this.receivedOutOfOrderSeq[0].seq === this.lastAckSequenceNumber+1) {
                        this.emit('message', this.receivedOutOfOrderSeq.shift().message);
                        this.lastAckSequenceNumber++;
                    }
                } else {
                    let insertedAt = -1;
                    for(let i = 0; i < this.receivedOutOfOrderSeq.length; i++) {
                        if(seq < this.receivedOutOfOrderSeq[i].seq) {
                            insertedAt = i;
                            this.receivedOutOfOrderSeq.splice(i, 0, { seq, message: decoded });
                            break;
                        }
                    }
                    if(insertedAt < 0) {
                        this.receivedOutOfOrderSeq.push({ seq, message: decoded })
                    }
                }
                return;
            }
        }
    }

    private addCandidate(candidate: CandidateSignal) {
        this.collectedSignals.push(candidate);
        this.collectedCandidates.push(candidate)
        if(!this.localDescription) {
            this.bufferedCandidates.push(candidate)
        } else {
            this.emit('added-signal', { candidate })
        }
    }
    private addSdp(sdp: SdpSignal) {
        this.collectedSignals.push(sdp);
        this.collectedSdps.push(sdp);
        if(!this.localDescription) {
            this.initialize(sdp);
        } else {
            this.emit('added-signal', { sdp })
        }
    }

    public receivedRemoteSignal(signal: { sdp?: SdpSignal, candidate?: CandidateSignal }) {
        if(signal.sdp) {
            const { sdp, type } = signal.sdp;
            this.peerConnection.setRemoteDescription(sdp, type as DescriptionType);
        } else {
            // @ts-ignore
            const { candidate, mid, sdpMid } = signal.candidate;
            const _mid = mid || sdpMid;
            this.peerConnection.addRemoteCandidate(candidate, _mid);
        }
    }

    private initialize(sdp: { sdp: string, type: string }) {
        if(this.localDescription) throw new Error(`Already initialized with a local description.`);
        this.localDescription = sdp;
        this.collectedSdps.push(sdp);
        this.emit('initial-sdp', { sdp: sdp.sdp });
        this.bufferedCandidates.forEach(c => {
            this.emit('added-candidate', { candidate: c.candidate });
        });
        this.bufferedCandidates.length = 0;
    }

    public async completeIceGathering() {
    }
    joinedOptions?: any;
    joinOptions?: any;
    gottiId: string;
    id: string;
    options: any;
    p2p_capable: boolean;
    p2p_enabled: boolean;
    pingCount: number;
    playerIndex: number;

    sessionId: string;
    state: "open" | "closed";
}