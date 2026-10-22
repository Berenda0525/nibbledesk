using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Automation;
using System.Web.Script.Serialization;

public static class GuaguaDesktopBridge {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int Size;public RECT Monitor;public RECT Work;public uint Flags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out RECT rectangle);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr monitor,ref MONITORINFO info);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder name,int size);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static volatile bool running=true;
  static object Probe(){
    IntPtr foreground=GetForegroundWindow();RECT rect;var info=new MONITORINFO();info.Size=Marshal.SizeOf(info);int state=0;
    bool ok=SHQueryUserNotificationState(out state)==0;
    bool full=false;var className=new StringBuilder(128);GetClassName(foreground,className,128);
    if(foreground!=IntPtr.Zero&&className.ToString()!="Progman"&&className.ToString()!="WorkerW"&&GetWindowRect(foreground,out rect)&&GetMonitorInfo(MonitorFromWindow(foreground,2),ref info))
      full=rect.Left<=info.Monitor.Left+2&&rect.Top<=info.Monitor.Top+2&&rect.Right>=info.Monitor.Right-2&&rect.Bottom>=info.Monitor.Bottom-2;
    return new {available=ok,fullscreen=full,notificationState=state,foregroundId=foreground.ToInt64()};
  }
  static object Selection(IntPtr expectedForeground){
    var foreground=GetForegroundWindow();
    if(expectedForeground!=IntPtr.Zero&&foreground!=expectedForeground)return new {text="",reason="focus-changed"};
    var element=AutomationElement.FocusedElement;
    if(element==null)return new {text="",reason="no-selection"};
    for(int depth=0;depth<8&&element!=null;depth++){
      if(element.Current.IsPassword)return new {text="",reason="protected-field"};
      object pattern;
      if(element.TryGetCurrentPattern(TextPattern.Pattern,out pattern)){
        var ranges=((TextPattern)pattern).GetSelection();var text=new StringBuilder();
        foreach(var range in ranges){if(text.Length>12000)break;string value=range.GetText(12001-text.Length);if(!String.IsNullOrWhiteSpace(value)){if(text.Length>0)text.Append("\n");text.Append(value);}}
        if(GetForegroundWindow()!=foreground)return new {text="",reason="focus-changed"};
        if(text.Length>12000)return new {text="",reason="selection-too-long"};
        if(text.Length>0)return new {text=text.ToString(),reason="selected"};
      }
      element=TreeWalker.ControlViewWalker.GetParent(element);
    }
    return new {text="",reason="selection-unavailable"};
  }
  [STAThread] public static int Main(string[] args){
    Console.OutputEncoding=new UTF8Encoding(false);try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
    try{
      if((args.Length==1||args.Length==2)&&args[0]=="selection"){var expected=args.Length==2?new IntPtr(Int64.Parse(args[1])):IntPtr.Zero;Console.WriteLine(Json.Serialize(Selection(expected)));return 0;}
      if(args.Length==1&&args[0]=="probe"){Console.WriteLine(Json.Serialize(Probe()));return 0;}
      if(args.Length!=1||args[0]!="watch")return 2;
      var stop=new Thread(()=>{try{while(Console.ReadLine()!=null){} }catch{}running=false;});stop.IsBackground=true;stop.Start();
      string previous=null;int heartbeat=0;
      while(running){string current=Json.Serialize(Probe());if(current!=previous||heartbeat++>=4){Console.WriteLine(current);Console.Out.Flush();previous=current;heartbeat=0;}Thread.Sleep(250);}
      return 0;
    }catch(Exception error){Console.WriteLine(Json.Serialize(new {available=false,text="",reason=error.GetType().Name}));return 1;}
  }
}
