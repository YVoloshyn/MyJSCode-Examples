var srcPath = ctx.instance.getAttachmentsPath();
var archivedProjects = false;
for (var i in srcPath) {
    var pathArr = srcPath[i].split('/'),
        fileName = pathArr[pathArr.length - 1];
    pathArr[pathArr.length - 1] = null;
    var currentPath = pathArr.join('/');
    var importStr = {
        path: currentPath,
        file_name: "*",
        columns_separator: ",",
        after_save_callback: "aftersaveFunc",

        mapping: [{
            input_column_name: 'QA project',
            output_alias_name: 'qa_project',
            callback_function_name: 'findProject'
        }, {
            input_column_name: 'Issue',
            output_alias_name: 'tracker',
            callback_function_name: 'prepareTracker'
        }, {
            input_column_name: 'Project',
            output_alias_name: 'project'
        }, {
            input_column_name: 'SL project',
            output_alias_name: 'project2'
        }, {
            input_column_name: 'Date',
            output_alias_name: 'date',
            callback_function_name: 'convertDate'
        }, {
            input_column_name: 'User',
            output_alias_name: 'user'
        }, {
            input_column_name: 'Issue',
            output_alias_name: 'issue'
        }, {
            input_column_name: 'Comment',
            output_alias_name: 'comments_redmine'
        }, {
            input_column_name: 'Hours',
            output_alias_name: 'hours'
        }]
    };
    custom.getModelByAlias('redmine_activity').execImportCSV(JSON.stringify(importStr));
}

function convertDate(input) {
    return new Date(input);
}

function convertHours(input) {
    return parseFloat(input);
}

function findProject(input) {
    var modelQaProject = custom.getModelByAlias('qa_project').execQuery({
        where: {
            qa_project: input
        }
    });
    var qaProjectId = modelQaProject.length > 0 ? modelQaProject[0].getValueByField('id') : null;
    return qaProjectId;
}

function prepareTracker(input) {
    var result = input.match(/(^.+)\s#/);
    utils.addLogRecord('Tracker: ' + result[1] + ' RESULT: ' + result);
    // return input.toLowerCase();
    return result[1].toLowerCase();
}

function aftersaveFunc(rec) {
    if (rec) {
        if (utils.isEmpty(rec.getValueByField('project2')) || rec.getValueByField('project2') === "") {
            var project_rm = rec.getValueByField('project'),
                existRecord = custom.getModelByAlias('import_redmine_activity_rel').execQuery({
                    where: {
                        project_rm: project_rm
                    }
                })[0];
        } else {
            var project_rm = rec.getValueByField('project2'),
                existRecord = custom.getModelByAlias('import_redmine_activity_rel').execQuery({
                    where: {
                        project_rm: project_rm
                    }
                })[0];
        }
    }

    if (!utils.isEmpty(existRecord)) {
        var project_pm_rec = custom.getModelByAlias('projectnew').execQuery({
            where: {
                id: existRecord.getValueByField('project_pm')
            }
        })[0];
        if (!utils.isEmpty(project_pm_rec)) {
            var project_pm_id = project_pm_rec.getValueByField('id');
            rec.setValueToField('project_pm', project_pm_id);
            if (!utils.isEmpty(rec.getValueByField('project2'))) {
                rec.setValueToField('project', rec.getValueByField('project2'));
            } else {
                rec.setValueToField('project', rec.getValueByField('project'));
            }
        } else {
            rec.setValueToField('project', rec.getValueByField('project'));
            rec.setValueToField('project_pm', existRecord);
        }
    } else if (utils.isEmpty(rec.getValueByField('project'))) {
        rec.setValueToField('project', rec.getValueByField('project2'));
        rec.setValueToField('project_pm', 355);
    } else if (utils.isEmpty(existRecord) && (!utils.isEmpty(rec.getValueByField('project2')))) {
        rec.setValueToField('project', rec.getValueByField('project2'));
        rec.setValueToField('project_pm', 355);
    } else if (utils.isEmpty(existRecord) && (!utils.isEmpty(rec.getValueByField('project'))) || rec.getValueByField('project2') === "") {
        rec.setValueToField('project', rec.getValueByField('project'));
        rec.setValueToField('project_pm', 355);
    }
    /*if (project_rm === "") {
        rec.setValueToField('project_pm', 354 ); 
    }*/

    var userAcronim = rec.getValueByField('user'),
        userCustomId = custom.getModelByAlias('users').execQuery({
            where: {
                short: userAcronim
            }
        })[0];
    if (!utils.isEmpty(userCustomId)) {
        var userCustomSysId = userCustomId.getValueByField('system_user');
        var userSystemId = system.getModelByTable('users').execQuery({
            where: {
                id: userCustomSysId
            }
        })[0];
    }
    if (!utils.isEmpty(userSystemId)) {
        rec.setValueToField('user_pm', userSystemId.getValueByField('id'));
    }
    //==========
    var UserInfo = gs.getUserInfo(rec.getValueByField('user_pm'));
    var teamWgId = UserInfo[0];
    var LineManagerId = UserInfo[2];
    rec.setValueToField('team', teamWgId);
    rec.setValueToField('line_manager', LineManagerId);

    var projID = custom.getModelByAlias("projectnew").execQuery({
        where: {
            id: rec.getValueByField('project_pm')
        }
    })[0];
    //var projRec = projID.find( { id:projID } )[0];
    var coordinatorId = projID.getValueByField('coordinator');
    rec.setValueToField('coordinator', coordinatorId);
    var respForTimelogApp = projID.getValueByField('responsible_for_timelog_approval_project');
    rec.setValueToField('responsible_for_timelog_approval', respForTimelogApp);
    var projectStatus = projID.getValueByField('status');
    if (projectStatus == 9) {
        rec.setValueToField('archived_project', true);
        archivedProjects = true;
    }
    //==========

    rec.setValueToField('redmine_import', ctx.instance.getValueByField('id'));
    rec.save();
}
ctx.instance.setValueToField('for_create_activities_button', true);
ctx.instance.save();

if (archivedProjects === true) {
    actions.redirectToMsg(ctx.instance, "Some activities have Archived project! Please, change ProjectPM name before creation!", 1);
}