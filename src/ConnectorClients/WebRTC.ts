import {IConnectorClient} from "./IConnectorClient";
import {Client} from "gotti-channels/dist";
import {EventEmitter} from "events";
import {DataChannel, DescriptionType, RtcConfig, PeerConnection} from "node-datachannel";
import {MAX_ACK_SEQ, Protocol} from "../Protocol";
import * as assert from "assert";
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
        message?: Buffer
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
    public dataChannel : DataChannel;
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
    private orderedReliableBuffer : ReliableBufferLookup = {};
    private reliableBuffer : ReliableBufferLookup = {};
    private alreadyProcessedReliableSeqs : {[number: string]: any } = {};
    private lowestUnorderedSeqProcessed: number = 0;

    public hasAcks : boolean = false;

    private closeReason : string = '';
    private emittedClose : boolean = false;

    constructor(gottiId: string, config: RtcConfig) {
        super();
        this.gottiId = gottiId;
        this.peerConnection = new nodeDataChannel.PeerConnection(gottiId, config);
        this.peerConnection.onStateChange(state => {
            const wasClosingState = state === 'closed' || state === 'disconnected';
            if(wasClosingState) {
                if(this.state === "open") {
                    this.close();
                }
                if(!this.emittedClose) {
                    this.emittedClose = true;
                    this.emit('closed-channel', this.closeReason);
                    this.removeAllListeners();
                    this.peerConnection = null;
                    nodeDataChannel.cleanup();
                }
            }
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
            protocol: "UDP",
            reliability: {rexmit: 0, type: 2, unordered: true},
        });
        this.dataChannel.onOpen(() => {
            this.connected = true;
            this.state = 'open';
            this.emit('opened-channel', this.dataChannel);
        });
        this.dataChannel.onMessage(this._onMessage.bind(this));
    }
    channelClient: Client;
    close(reason?: string): void {
        if(reason) {
            this.closeReason = reason;
        }
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
        if(this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        } else {
            this.peerConnection.close();
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
            if(++this.nextOrderedSequenceNumber === MAX_ACK_SEQ) { this.nextOrderedSequenceNumber = 1; }
            seq = this.nextOrderedSequenceNumber;
            lookup = this.orderedReliableBuffer;
        } else {
            if(++this.nextSequenceNumber === MAX_ACK_SEQ) { this.nextSequenceNumber = 1;}
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
        const retryRate = opts.retryRate || 50;
        if(retry === 0) {
            const firstRetryRate = opts.firstRetryRate || 15;
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
                    let next = this.lowestUnorderedSeqProcessed+1 === MAX_ACK_SEQ ? 1 : this.lowestUnorderedSeqProcessed+1;
                    while(this.alreadyProcessedReliableSeqs[next]) {
                        delete this.alreadyProcessedReliableSeqs[next];
                        this.lowestUnorderedSeqProcessed = next;
                        next = next+1 === MAX_ACK_SEQ ? 1 :next+1
                    }
                }
            } else { // 12 is max reliable ordered protocol
                let isResetSeq = seq < 1500 && this.lastAckSequenceNumber > MAX_ACK_SEQ-1500;
                !this.sentOrderedAckSequences.includes(seq) && this.sentOrderedAckSequences.push(seq);
                // todo: check if we went over the 65535 max meaning the seq reset.
                if(seq <= this.lastAckSequenceNumber && !isResetSeq) return;
                // we received the next needed ack sequence.

                if(this.lastAckSequenceNumber === seq-1) {
                    this.emit('message', decoded);
                    ++this.lastAckSequenceNumber
                    if(this.lastAckSequenceNumber+1=== MAX_ACK_SEQ) {
                        this.lastAckSequenceNumber = 0;
                        this.receivedOutOfOrderSeq.forEach(s => s.seq-=MAX_ACK_SEQ);
                    }
                    // do callback for all sequences we already received.
                    while(this.receivedOutOfOrderSeq.length) {
                        if(this.receivedOutOfOrderSeq[0].seq === this.lastAckSequenceNumber+1) {
                            this.emit('message', this.receivedOutOfOrderSeq.shift().message);
                            this.lastAckSequenceNumber++;
                            if(this.lastAckSequenceNumber+1 === MAX_ACK_SEQ) {
                                this.receivedOutOfOrderSeq.forEach(s => s.seq-=MAX_ACK_SEQ);
                                this.lastAckSequenceNumber = 0;
                            }
                        } else {
                            return;
                        }
                    }
                } else {
                    let insertedAt = -1;
                    const adjustedSeq = isResetSeq ? seq + MAX_ACK_SEQ : seq;
                    for(let i = 0; i < this.receivedOutOfOrderSeq.length; i++) {
                        if(adjustedSeq === this.receivedOutOfOrderSeq[i].seq) return;
                        if(adjustedSeq < this.receivedOutOfOrderSeq[i].seq) {
                            insertedAt = i ;
                            this.receivedOutOfOrderSeq.splice(i, 0, { seq: adjustedSeq , message: decoded });
                            break;
                        }
                    }
                    if(insertedAt < 0) {
                        this.receivedOutOfOrderSeq.push({ seq: adjustedSeq, message: decoded })
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