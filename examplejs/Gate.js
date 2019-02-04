const http = require('http');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { Gate, AreaServer } = require('../dist');

const { connector1Options, connector2Options, areaServerOptions } = require('./config');

const ExampleConnector = require('./server/Connectors/ExampleConnector');
const exampleConnector1 = new ExampleConnector(connector1Options);
const exampleConnector2 = new ExampleConnector(connector2Options);

const areaServer = new AreaServer(areaServerOptions);

const app = express();
const server = http.createServer(app);

const gate = new Gate(['127.0.0.1:8080', '127.0.0.1:8081']);

const port = 8080;

gate.registerGateKeep((req, res) => {
    if(req) {
        return true;
    } else {
        return false;
    }
});

app.use("/", express.static(path.resolve(__dirname, '.', 'client')));

app.get('/', function (req, res) {
    res.sendFile(path.resolve(__dirname, '.', 'client', 'example.html'))
});

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.text());
app.use(bodyParser.json({type: 'application/json'}));

app.get('/gate', gate.gateKeep);
app.post('/gate', gate.gameRequested);

setTimeout(() => {
    Promise.all([exampleConnector1.connectToAreas(), exampleConnector2.connectToAreas()])
        .then((values) => {
            app.listen(port, function () {
                console.log('listening on port...', port);
            });
        })
}, 100);
