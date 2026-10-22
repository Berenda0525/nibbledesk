/* SPDX-License-Identifier: MIT */
'use strict';
let zetajs,css,desktop,model,modifyListener,documentListener,interceptor,storing=false,extension;
const property=(Name,Value)=>new css.beans.PropertyValue({Name,Value});
const post=(cmd,details={})=>zetajs.mainPort.postMessage({cmd,...details});
function interceptFileCommands(frame){
  let slave=null,master=null;
  const commands=new Set(['.uno:Save','.uno:SaveAs','.uno:SaveAll']);
  let dispatcher;
  dispatcher=zetajs.unoObject([css.frame.XDispatch],{
    dispatch(url){post(url.Complete==='.uno:SaveAs'?'export-request':'save-request');},
    addStatusListener(listener,url){listener.statusChanged(new css.frame.FeatureStateEvent({Source:dispatcher,FeatureURL:url,IsEnabled:true,Requery:false}));},
    removeStatusListener(){}
  });
  const query=(url,target,flags)=>commands.has(url.Complete)?dispatcher:slave?.queryDispatch(url,target,flags)??null;
  interceptor=zetajs.unoObject([css.frame.XDispatchProviderInterceptor,css.frame.XInterceptorInfo],{
    getInterceptedURLs(){return [...commands];},
    queryDispatch:query,
    queryDispatches(requests){return requests.map(request=>query(request.FeatureURL,request.FrameName,request.SearchFlags));},
    getSlaveDispatchProvider(){return slave;},setSlaveDispatchProvider(value){slave=value;},
    getMasterDispatchProvider(){return master;},setMasterDispatchProvider(value){master=value;}
  });
  frame.registerDispatchProviderInterceptor(interceptor);
}
function openDocument(message){
  extension=message.kind;
  const factory={docx:'swriter',xlsx:'scalc',pptx:'simpress'};
  const source=message.isNew?'private:factory/'+factory[extension]:'file:///tmp/office/document.'+extension;
  model=desktop.loadComponentFromURL(source,'_default',0,[property('Hidden',false),property('ReadOnly',false),property('MacroExecutionMode',css.document.MacroExecMode.NEVER_EXECUTE),property('UpdateDocMode',css.document.UpdateDocMode.NO_UPDATE)]);
  if(!model)throw new Error('文档格式不受支持，或文件已损坏');
  model.getCurrentController().getFrame().getContainerWindow().FullScreen=true;
  interceptFileCommands(model.getCurrentController().getFrame());
  if(message.isNew){
    const filters={docx:'Office Open XML Text',xlsx:'Calc MS Excel 2007 XML',pptx:'Impress MS PowerPoint 2007 XML'};
    model.storeAsURL('file:///tmp/office/document.'+extension,[property('Overwrite',true),property('FilterName',filters[extension])]);
  }
  modifyListener=zetajs.unoObject([css.util.XModifyListener],{modified(){post('modified',{dirty:model.isModified()});},disposing(){}});
  model.addModifyListener(modifyListener);
  documentListener=zetajs.unoObject([css.document.XDocumentEventListener],{documentEventOccured(event){if(!storing&&['OnSaveDone','OnSaveAsDone'].includes(event.EventName))post('stored');},disposing(){}});
  model.addDocumentEventListener(documentListener);
  post('document-ready');
}
Module.zetajs.then(value=>{
  zetajs=value;css=zetajs.uno.com.sun.star;desktop=css.frame.Desktop.create(zetajs.getUnoComponentContext());
  zetajs.mainPort.onmessage=event=>{
    try{
      if(event.data.cmd==='open')openDocument(event.data);
      else if(event.data.cmd==='save'){if(!model)throw new Error('文档尚未打开');storing=true;try{model.store();}finally{storing=false;}post('stored');}
      else if(event.data.cmd==='preview'){
        if(!model)throw new Error('文档尚未打开');
        const filter=['xls','xlsx','ods'].includes(extension)?'calc_pdf_Export':['ppt','pptx','odp'].includes(extension)?'impress_pdf_Export':'writer_pdf_Export';
        model.storeToURL('file:///tmp/office/preview.pdf',[property('Overwrite',true),property('FilterName',filter)]);post('preview-ready');
      }
    }catch(error){storing=false;post('error',{message:'文档编辑失败：'+String(error?.message||error).slice(0,400)});}
  };
  post('thread-ready');
});
