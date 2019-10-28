export declare abstract class BaseWebServer {
    app: any;
    constructor();
    abstract addHandler(route: string, handler: Function): any;
}
