setTimeout(() => {
    let connectorURLs = [null, null];

    let pickingConnector = false;

    const statusDiv = document.getElementById('status');
    const actionDiv = document.getElementById('action');
    const dataDiv = document.getElementById('data');

    let client;
    let currentAction = function() {
        client = new Gotti.Client("http://" + window.location.hostname + ":8080");
        statusDiv.innerText = 'Created Gotti Client';
        actionDiv.innerText = 'Press Space to receive Gate authorization';

        currentAction = action2;
    };

    let action2 = function() {
        client.getGateData((data) => {
            connectorURLs = data;
            statusDiv.innerText = 'Received Gate Authorization';
            actionDiv.innerText = (
                    `Press 1 to connect to connector on url' ${connectorURLs[0]} \n
                    Press 2 to connect to connector on url ${connectorURLs[1]}`
            );
            pickingConnector = true;
            currentAction = action3;
        });


    };


    let action3 = function(connectorURI) {

    };

    document.onkeypress = (event) => {
        if(pickingConnector) {
            if(event.keyCode === 49 ) {
                pickingConnector = false;
            }
            if(event.keyCode === 50) {
                pickingConnector = false;
            }
        } else {
            console.log('yo')
            if(event.keyCode === 32) {
                currentAction();
            }
        }
    };
}, 100);