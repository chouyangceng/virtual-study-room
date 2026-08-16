using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class LightweightLauncher
{
    private const int Port = 43110;
    private const string AppUrl = "http://127.0.0.1:43110/index.html";

    [STAThread]
    private static void Main()
    {
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            string serverScript = Path.Combine(root, "server", "windows-archive.js");
            string edge = FindEdge();
            string node = FindExecutable("node.exe");

            if (!File.Exists(serverScript))
                throw new FileNotFoundException("\u8f7b\u91cf\u7248\u6587\u4ef6\u4e0d\u5b8c\u6574\uff1a\u7f3a\u5c11\u672c\u5730\u670d\u52a1\u3002", serverScript);
            if (String.IsNullOrEmpty(edge))
                throw new FileNotFoundException("\u672a\u627e\u5230 Microsoft Edge\uff0c\u8bf7\u5148\u5b89\u88c5\u6216\u4fee\u590d Edge\u3002");
            if (String.IsNullOrEmpty(node))
                throw new FileNotFoundException("\u672a\u627e\u5230 Node.js\uff0c\u65e0\u6cd5\u542f\u52a8\u672c\u5730\u5f52\u6863\u670d\u52a1\u3002");

            if (!IsHealthy())
            {
                string appHome = Directory.GetParent(root).FullName;
                string archiveDir = Path.Combine(appHome, "\u5b66\u4e60\u6570\u636e", "Windows\u5f52\u6863");
                Directory.CreateDirectory(archiveDir);

                ProcessStartInfo server = new ProcessStartInfo();
                server.FileName = node;
                server.Arguments = Quote(serverScript);
                server.WorkingDirectory = root;
                server.UseShellExecute = false;
                server.CreateNoWindow = true;
                server.WindowStyle = ProcessWindowStyle.Hidden;
                server.EnvironmentVariables["VSR_ARCHIVE_PORT"] = Port.ToString();
                server.EnvironmentVariables["VSR_ARCHIVE_DATA_DIR"] = archiveDir;
                Process.Start(server);

                for (int i = 0; i < 50 && !IsHealthy(); i++) Thread.Sleep(100);
                if (!IsHealthy())
                    throw new InvalidOperationException("\u672c\u5730\u670d\u52a1\u542f\u52a8\u5931\u8d25\uff0c\u7aef\u53e3 43110 \u53ef\u80fd\u88ab\u5176\u4ed6\u7a0b\u5e8f\u5360\u7528\u3002");
            }

            string edgeData = Path.Combine(root, "EdgeData");
            string edgeCache = Path.Combine(Path.GetTempPath(), "VirtualStudyRoomEdgeCache");
            Directory.CreateDirectory(edgeData);
            Directory.CreateDirectory(edgeCache);

            ProcessStartInfo browser = new ProcessStartInfo();
            browser.FileName = edge;
            browser.Arguments = "--app=" + AppUrl
                + " --start-maximized --no-first-run --disable-features=msEdgeSidebarV2"
                + " --user-data-dir=" + Quote(edgeData)
                + " --disk-cache-dir=" + Quote(edgeCache);
            browser.UseShellExecute = false;
            browser.CreateNoWindow = true;
            Process.Start(browser);
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "\u865a\u62df\u81ea\u4e60\u5ba4\u65e0\u6cd5\u542f\u52a8", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static bool IsHealthy()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + Port + "/api/v1/health");
            request.Timeout = 350;
            request.ReadWriteTimeout = 350;
            request.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                return response.StatusCode == HttpStatusCode.OK;
            }
        }
        catch { return false; }
    }

    private static string FindEdge()
    {
        string[] candidates = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe")
        };
        foreach (string candidate in candidates)
            if (File.Exists(candidate)) return candidate;
        return FindExecutable("msedge.exe");
    }

    private static string FindExecutable(string name)
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? String.Empty;
        foreach (string folder in path.Split(Path.PathSeparator))
        {
            try
            {
                string candidate = Path.Combine(folder.Trim(), name);
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }

        string knownNode = @"D:\Program Files\nodejs\node.exe";
        if (name.Equals("node.exe", StringComparison.OrdinalIgnoreCase) && File.Exists(knownNode))
            return knownNode;
        return null;
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
}
