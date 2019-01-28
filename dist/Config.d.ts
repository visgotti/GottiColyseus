interface AreaRoom {
    id: string;
    roomConstructor: () => any;
    options: any;
}
interface AreaServer {
    serverId: string;
    areaRooms: Array<AreaRoom>;
}
interface GameConfig {
    connectorCount: number;
    areaServers: Array<AreaServer>;
}
interface Config {
    games: Array<GameConfig>;
    connector_servers: Array<string>;
    area_servers: Array<string>;
}
export default Config;
