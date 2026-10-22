using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;

internal static class SanduBAH
{
    private static string QuoteArgument(string argument)
    {
        var quoted = new StringBuilder("\"");
        var backslashCount = 0;
        foreach (var character in argument)
        {
            if (character == '\\')
            {
                backslashCount++;
                continue;
            }
            if (character == '"')
            {
                quoted.Append('\\', backslashCount * 2 + 1);
                quoted.Append('"');
                backslashCount = 0;
                continue;
            }
            quoted.Append('\\', backslashCount);
            quoted.Append(character);
            backslashCount = 0;
        }
        quoted.Append('\\', backslashCount * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private static int Main(string[] arguments)
    {
        try
        {
            string repositoryRoot;
            string powerShellExecutable;
            using (var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("SanduBAH.paths"))
            using (var reader = new StreamReader(resource, Encoding.UTF8))
            {
                repositoryRoot = reader.ReadLine();
                powerShellExecutable = reader.ReadLine();
            }
            if (arguments.Length == 0 || (arguments.Length == 1 && arguments[0] == "gui"))
            {
                var electronPath = Path.Combine(repositoryRoot, "build", "sandubah", "gui", "runtime", "electron.exe");
                var mainPath = Path.Combine(repositoryRoot, "src", "sandubah-desktop", "main.cjs");
                if (!File.Exists(electronPath) || !File.Exists(mainPath))
                    throw new FileNotFoundException("Compile a interface com scripts/build-sandubah-gui.ps1 nesta copia local.");
                var graphicalStart = new ProcessStartInfo(electronPath, QuoteArgument(mainPath));
                graphicalStart.WorkingDirectory = repositoryRoot;
                graphicalStart.UseShellExecute = false;
                graphicalStart.CreateNoWindow = true;
                graphicalStart.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
                using (var graphicalProcess = Process.Start(graphicalStart)) { return 0; }
            }
            var scriptPath = Path.Combine(repositoryRoot, "scripts", "sandubah.ps1");
            if (!File.Exists(scriptPath) || !File.Exists(powerShellExecutable))
                throw new FileNotFoundException("A copia local ou o PowerShell foi movido. Reinstale o SanduBAH pela pasta do Ruflo.");

            var commandLine = new StringBuilder("-NoLogo -NoProfile -File ");
            commandLine.Append(QuoteArgument(scriptPath));
            if (arguments.Length == 1 && arguments[0] == "--version")
                arguments = new[] { "cli", "--version" };
            else if (arguments.Length == 1 && arguments[0] == "--describe")
                arguments = new[] { "describe" };
            else if (arguments.Length == 1 && arguments[0] == "--help")
                arguments = new[] { "help" };
            foreach (var argument in arguments)
            {
                commandLine.Append(' ');
                commandLine.Append(QuoteArgument(argument));
            }
            var startInfo = new ProcessStartInfo(powerShellExecutable, commandLine.ToString());
            startInfo.WorkingDirectory = repositoryRoot;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            using (var process = Process.Start(startInfo))
            {
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs output) { if (output.Data != null) Console.WriteLine(output.Data); };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs output) { if (output.Data != null) Console.Error.WriteLine(output.Data); };
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("SanduBAH: " + error.Message);
            if (arguments.Length == 0)
            {
                System.Windows.Forms.MessageBox.Show(error.Message, "SanduBAH", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
            }
            return 1;
        }
    }
}
