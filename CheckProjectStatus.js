var projectModel = custom.getModelByAlias('projectnew').find({id:ctx.instance.getValueByField("project")})[0];
var projectStatus = projectModel.getValueByField('status');

if (ctx.action == 'create' && projectStatus == "6"){
    utils.addLogRecord(projectStatus, 0);
    alert("This Project was Archived ! Please select another Project. ");
    return false;
}
return true;