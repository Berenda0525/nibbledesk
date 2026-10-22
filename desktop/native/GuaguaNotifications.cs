using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

public static class GuaguaNotifications {
  sealed class PermissionWindow : Form {
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams {get {var value=base.CreateParams;value.ExStyle|=0x08000080;return value;}}
  }
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  static Task<T> AwaitOperation<T>(Windows.Foundation.IAsyncOperation<T> operation) {
    var completion=new TaskCompletionSource<T>();
    operation.Completed=(source,state)=>{
      try{completion.TrySetResult(source.GetResults());}catch(Exception error){completion.TrySetException(error);}
    };
    return completion.Task;
  }
  static object Access(UserNotificationListenerAccessStatus access) {
    if(access == UserNotificationListenerAccessStatus.Allowed)
      return new {status="available",message="Windows 已允许通知访问，仅显示微信和飞书的新通知。"};
    if(access == UserNotificationListenerAccessStatus.Denied)
      return new {status="denied",message="Windows 尚未允许通知访问，可在系统设置中检查通知权限。"};
    return new {status="unavailable",message="尚未获得 Windows 通知访问权限，请点击请求授权。"};
  }
  static object Failure(Exception error) {
    return new {status="unavailable",message="此安装方式或 Windows 版本未提供通知监听能力。系统通知仍由 Windows 正常显示。",code="0x"+error.HResult.ToString("X8")};
  }
  static async Task<object> Execute(string mode) {
    var listener=UserNotificationListener.Current;
    if(mode=="request")return Access(await AwaitOperation(listener.RequestAccessAsync()));
    var access=listener.GetAccessStatus();
    if(mode=="status" || access!=UserNotificationListenerAccessStatus.Allowed)return Access(access);
    if(mode!="list")throw new ArgumentException("Unsupported operation");
    var notifications=await AwaitOperation(listener.GetNotificationsAsync(NotificationKinds.Toast));
    var items=new List<object>();
    foreach(var notification in notifications){
      try{
        var appName=notification.AppInfo.DisplayInfo.DisplayName ?? "";
        var appId=notification.AppInfo.AppUserModelId ?? "";
        var identity=(appName+" "+appId).ToLowerInvariant();
        if(!(identity.Contains("wechat")||identity.Contains("weixin")||identity.Contains("微信")||identity.Contains("feishu")||identity.Contains("lark")||identity.Contains("飞书")))continue;
        var binding=notification.Notification.Visual.GetBinding(KnownNotificationBindings.ToastGeneric);
        if(binding==null)continue;
        var elements=binding.GetTextElements().Select(item=>item.Text ?? "").ToArray();
        string title=elements.FirstOrDefault()??"",body=String.Join("\n",elements.Skip(1));
        if(title.Length>200)title=title.Substring(0,200);
        if(body.Length>1000)body=body.Substring(0,1000);
        items.Add(new {id=notification.Id.ToString(),app=appName,title=title,body=body,created=notification.CreationTime.ToString("o")});
      }catch{}
    }
    return new {status="available",message="Windows 已允许通知访问，仅显示微信和飞书的新通知。",items=items};
  }
  [STAThread] public static int Main(string[] args) {
    Console.OutputEncoding=new UTF8Encoding(false);
    if(args.Length!=1 || (args[0]!="status"&&args[0]!="request"&&args[0]!="list"))return 2;
    if(args[0]!="request"){
      try{Console.WriteLine(Json.Serialize(Execute(args[0]).GetAwaiter().GetResult()));}
      catch(Exception error){Console.WriteLine(Json.Serialize(Failure(error)));}
      return 0;
    }
    // A private UI thread owns the WinRT permission request. The form stays hidden.
    object result=null;
    using(var window=new PermissionWindow {ShowInTaskbar=false,FormBorderStyle=FormBorderStyle.None,Opacity=0,Width=1,Height=1,Text="瓜瓜通知授权"}){
      window.Load+=async(sender,eventArgs)=>{
        window.Hide();
        try{result=await Execute(args[0]);}catch(Exception error){result=Failure(error);}
        window.Close();
      };
      Application.Run(window);
    }
    Console.WriteLine(Json.Serialize(result));return 0;
  }
}
