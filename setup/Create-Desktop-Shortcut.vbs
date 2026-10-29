Option Explicit
Dim shell, fso, folder, exe, shortcut
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' this file is in <Charles>\setup\; the app is one folder up
folder = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
exe = folder & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
 MsgBox "Once ZIP dosyasinin tamamini bir klasore cikartin.", 48, "ProjectCharles v0.9.10 Beta"
 WScript.Quit 1
End If
Set shortcut = shell.CreateShortcut(shell.SpecialFolders("Desktop") & "\ProjectCharles v0.9.10 Beta.lnk")
If fso.FileExists(folder & "\Charles.exe") Then
 shortcut.TargetPath = folder & "\Charles.exe"
 shortcut.Arguments = ""
Else
 shortcut.TargetPath = exe
 shortcut.Arguments = Chr(34) & folder & Chr(34)
End If
shortcut.WorkingDirectory = folder
shortcut.IconLocation = folder & "\public\charles.ico"
shortcut.Description = "ProjectCharles v0.9.10 Beta"
shortcut.Save
MsgBox "Masaustu kisayolu olusturuldu. Charles'i kisayoldan acabilirsiniz.", 64, "ProjectCharles v0.9.10 Beta"
