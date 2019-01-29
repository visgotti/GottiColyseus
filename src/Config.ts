interface AreaRoom {
    id: string,
    constructorPath: string,
    options: any, // sent to client in an { [areaId]: options } map when join
}

interface AreaServer {
    serverId: string,
    areaRooms: Array<AreaRoom>
}

interface GameConfig {
    connectorCount: number,  //how many connector servers you want to use.
    areaServers: Array<AreaServer>
}

interface Config {
    games: Array<GameConfig>,
    connector_servers: Array<string>, // lists pool of connector servers
    area_servers: Array<string> // lists pool of area servers
}

export default Config


