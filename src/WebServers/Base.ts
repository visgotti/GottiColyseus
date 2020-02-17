import { GOTTI_ROUTE_BODY_PAYLOAD } from '../Protocol';
export abstract class BaseWebServer {
    public app: any;
    constructor() {};
    abstract addHandler(route: string, handler: Function);
}