restservice.host = '';
var messageContours = JSON.stringify( 
    {"deadZonePercent":0,"pixelNoise":8}
    );
var requestContours = JSON.stringify({"request":messageContours}),
    responseContours = restservice.post('/newGetContoursTask', requestContours),
    responseContoursParse = JSON.parse(responseContours.match(/\{.+"}/));
    
var idOfTask = responseContoursParse.id;
utils.addLogRecord("idOfTask = " + idOfTask);

var i = 1;
while(i < 20){
    utils.cmd.run('sleep 20');
    var checkStatusContours = restservice.get('/tasks/get/' + idOfTask, '{}');
    utils.addLogRecord("YarVol || checkStatusContours = " + JSON.stringify(checkStatusContours));
    var resContours = JSON.parse(checkStatusContours.match(/\{.+"}/));
    if(resContours.status == "COMPLETED"){
        var resResultContours = resContours.response;
        break;
    }else if(resContours.status == "ERROR"){
        logger('ERROR IN COUNTUR TASK !', 1);
        break;
    }else if(resContours.status == "CANCELED"){
        logger('TASK CANCELED !', 1);
        break;
    }else{
        i++;
    }
}
utils.addLogRecord('resResultContours = ' + JSON.stringify(resResultContours));

function logger(msg, lvl) {
    if (lvl > 0) utils.addLogRecord('Image Rec. | ' + msg, 1);
}