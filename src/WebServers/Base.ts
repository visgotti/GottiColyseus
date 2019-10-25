import { GOTTI_ROUTE_BODY_PAYLOAD } from '../Protocol';
export class BaseWebServer {
    public app: any;
    constructor() {};
    post(route, handler) {
        if(!this.app) {
            throw new Error('Cannot add route since theres no express server initialized on web server')
        }
        this.app.post(route, (req, res) => {
            Promise.resolve(handler(req.body[GOTTI_ROUTE_BODY_PAYLOAD])).then((responseObject) => {
                return res.status(200).json(responseObject);
            }).catch(err => {
                return res.status(401).json({error: err})
            })
        })
    }
    get(route, handler) {
        if(!this.app) {
            throw new Error('Cannot add route since theres no express server initialized on web server')
        }
        this.app.get(route, (req, res) => {
            Promise.resolve(handler(req.query)).then((responseObject) => {
                return res.status(200).json(responseObject);
            }).catch(err => {
                return res.status(401).json({error: err})
            })
        })
    }
}