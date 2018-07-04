var debug = true;
logger( 'AM start escalation Tower Audit Data: ' + dt.now() );
var towerGLalt = 50, // custom.getModelByAlias('tower').find({id: towerId})[0].getValueByField('altitude_above_sea_level');
    absAlt = [];
var dataHash = {}, latLngAlt, rfLogIn = [], distance, droneCoords,
    coords = {
        photo: {},
        log: {}
    },
    flightPathModel = custom.getModelByAlias('flight_path'),
    flightPath, flightPathAlt;

var towerDataQuery = custom.getModelByAlias('tower_audit_data').createQuery();
towerDataQuery.addCondition('status', 2);//.addAndCondition('created_at', '>', dt.getDayStart(-60));
towerDataQuery.setLimit(0);
towerDataQuery.getFields(['id', 'tower_id', 'tower_audit']);
var towerDataRecords = towerDataQuery.exec();
var towerModelId = custom.getId('tower_audit_data');

var attachModel = custom.getModelByAlias('attachment'),
    attachQuery, attachQueryResult, singleRecAttach,
    sqlReq, strSql, handled = [], rfLog,
    firstInGroup = {
      lat: null,
      long: null,
      id: null
    };

logger( 'AM Tower Audit Data | before cycle through towerDataRecords: ' + dt.now() );
for ( var i in towerDataRecords ) {
    logger( 'AM Tower Audit Data inside cycle: ' + i );
    convertLog( towerDataRecords[i] );
    handled = [];
    
    //YarVol || getting Altitude from Flight Path
    //======================================
    var towerAuditRecords = custom.getModelByAlias('tower_audit').execQuery({where:{
        tower_id:towerDataRecords[i].getValueByField('tower_id')
    }});
    if ( !utils.isEmpty(towerAuditRecords) ) {
        var towerAuditId = towerAuditRecords[towerAuditRecords.length - 1].getValueByField('id');
        flightPath = flightPathModel.execQuery({where:{tower_audit_id : towerAuditId}});
        flightPathAlt = [];
        for ( var j in flightPath ) {
            flightPathAlt.push(flightPath[j].getValueByField('altitude'));
        }
    }else{
        flightPathAlt = [];
        //flightPathAlt = [0,0];
    }
    //utils.addLogRecord('YarVol || flightPathAlt = ' + flightPathAlt);
    //=======================================    
    
    sortAttachments( handled, towerDataRecords[i],flightPathAlt);
    towerDataRecords[i].update( {status: 3} );
}
actions.redirectToMsg(ctx.view, 'Task creation was completed.');

// Functions
function sortAttachments(handled, parentRecord,flightPathAlt) {
    var parentRecordId = parentRecord.getValueByField('id'),
        towerId = parentRecord.getValueByField('tower_id'),
        towerAuditId = parentRecord.getValueByField('tower_audit');        

    attachQuery = attachModel.createQuery();
    attachQuery.addCondition('parent_object_id', towerModelId)
               .addAndCondition('parent_record_id', parentRecordId)
               .addAndCondition('file_file_name', 'ENDSWITH', 'jpg')
               .addAndCondition('id', '!=', handled);
    attachQuery.orderBy('id', 'asc');
    attachQuery.setLimit(1);
    attachQuery.getFields(['id', 'sys_position_lat', 'sys_position_long', 'sys_position_alt']);
    singleRecAttach = attachQuery.exec();

    if ( utils.isEmpty(singleRecAttach) ) return false;
    firstInGroup.lat = singleRecAttach[0].getValueByField('sys_position_lat');
    firstInGroup.long = singleRecAttach[0].getValueByField('sys_position_long');
    firstInGroup.alt = singleRecAttach[0].getValueByField('sys_position_alt');
    firstInGroup.id = singleRecAttach[0].getValueByField('id');

    attachQuery = attachModel.createQuery();
    attachQuery.addCondition('parent_object_id', towerModelId)
               .addAndCondition('parent_record_id', parentRecordId)
               .addAndCondition('sys_position_alt', '>', firstInGroup.alt - 0.5)
               .addAndCondition('sys_position_alt', '<', firstInGroup.alt + 0.5)
               .addAndCondition('id', '!=', handled);

    sqlReq = '6378000 *' +
        'acos(' +
            'cos( radians( ' + firstInGroup.lat + ' ) )' +
          '* cos( radians( sys_position_lat ) )' +
          '* cos( radians( sys_position_long ) - radians( ' + firstInGroup.long + ' ) )' +
          '+ sin( radians( ' + firstInGroup.lat + ' ) )' +
          '* sin( radians( sys_position_lat ) )' +
        ')';

    /*
    YarVol: comment sqlReq usage for making groups only with altitude;
    */    
    //strSql = sqlReq.toString(); // need to 'feature' java ConsString type
    //attachQuery.addFields({"radius": strSql});
    //attachQuery.having('radius', '<', '1 / 2');
    attachQuery.getAllFields();
    attachQuery.setLimit(0);
    attachQueryResult = utils.getResultValues(attachQuery.exec(), 'id');

    droneCoords = JSON.stringify({
        latitude: firstInGroup.lat,
        longitude: firstInGroup.long,
        altitude: firstInGroup.alt
    });

    var taskParams = {
        rfLog: JSON.stringify( findRfLog(firstInGroup) ),
        parentRecordId: parentRecordId,
        towerId: towerId,
        droneCoords: droneCoords,
        alt: firstInGroup.alt,
        towerAuditId: towerAuditId
    };

    if ( attachQueryResult.length > 0 ) {
        taskParams.ids = attachQueryResult;
        createTask(taskParams,flightPathAlt);
        handled = handled.concat(attachQueryResult);
    } else {
        taskParams.ids = [firstInGroup.id].toString();
        createTask(taskParams,flightPathAlt);
        handled.push(firstInGroup.id);
    }
    sortAttachments( handled, parentRecord );
}

function convertLog(record) {
    var attachments = record.getAttachments(),
        fileName, path, result;
    for (var i in attachments) {
        fileName = attachments[i].getValueByField('file_file_name');
        if (fileName.slice(-3) == 'log') {
            path = record.getAttachmentPath(fileName);
            result = utils.cmd.run('cat ' + path);
            break;
        }
    }

    if (!utils.isEmpty(result)) {
        var resultMatch = result.match(/(BEGIN.+?END)/g);
        for (i in resultMatch) {
          resultMatch[i] = resultMatch[i].split(';');
        }

        for (i in resultMatch) {
            latLngAlt = resultMatch[i][5].split(',');
            if (dataHash[i] === undefined) dataHash[i] = {};
            dataHash[i].long = latLngAlt[0];
            dataHash[i].lat = latLngAlt[1];
            dataHash[i].alt = latLngAlt[2];
            for (var c = 8; c < resultMatch[i].length - 2; c++) {
                if ((c % 2) === 0) dataHash[i][resultMatch[i][c]] = resultMatch[i][c + 1];
            }
        }
    }
}

function findRfLog(firstPhoto) {
    rfLogIn = [];
    coords.photo.lat = firstPhoto.lat;
    coords.photo.long = firstPhoto.long;
    coords.photo.alt = firstPhoto.alt;
    for (var i in dataHash) {
        coords.log.lat = dataHash[i].lat;
        coords.log.long = dataHash[i].long;
        distance = getDistance(coords.photo, coords.log);
        if (distance < 0.5) {
            var difAlt = Math.abs(dataHash[i].alt - firstPhoto.alt - towerGLalt);
            absAlt.push(JSON.stringify([difAlt, dataHash[i].alt, firstPhoto.alt, towerGLalt]));
            if (Math.abs(dataHash[i].alt - firstPhoto.alt - towerGLalt) < 0.5) {//YarVol changed from 0.5 to 0.75
                rfLogIn.push(dataHash[i]);
            }
        }
    }
    return rfLogIn;
}

function createTask(params) {
      var newTaskRec = custom.getModelByAlias('antennas_recognition_task').build({
        rf_log: params.rfLog,
        tower_audit_data: params.parentRecordId,
        drone_coords: params.droneCoords,
        tower_id: params.towerId,
        //altitude: params.alt,
        altitude: flightPathAlt[0],
        tower_audit_id: params.towerAuditId
    });

    flightPathAlt.shift();
    
    var attachments = attachModel.execQuery( { where: {id: params.ids} } );
    newTaskRec.linkAttachments(attachments);
    newTaskRec.exSave({doNotCheckMandatoryFields: true});
}

function rad(x) {
    return x * Math.PI / 180;
}

function getDistance(p1, p2) {
    var R = 6378137;
    var dLat = rad(p2.lat - p1.lat);
    var dLong = rad(p2.long - p1.long);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rad(p1.lat)) * Math.cos(rad(p2.lat)) *
        Math.sin(dLong / 2) * Math.sin(dLong / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
}

function logger(msg) {
    if (true) utils.addLogRecord(msg, 1);
}