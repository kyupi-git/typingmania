$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

public sealed class QQMusicSessionResult {
    public string Cookie = "";
    public string Uin = "";
    public string Error = "";
    public List<string> CachePaths = new List<string>();
}

public static class QQMusicMemoryReader {
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(
        IntPtr process, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr bytesRead);

    [DllImport("kernel32.dll")]
    private static extern int VirtualQueryEx(
        IntPtr process, IntPtr address, out MEMORY_BASIC_INFORMATION information, int length);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORY_BASIC_INFORMATION {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }

    private const uint PROCESS_VM_READ = 0x0010;
    private const uint PROCESS_QUERY_INFORMATION = 0x0400;
    private const uint MEM_COMMIT = 0x1000;
    private static readonly byte[] CookieMarker = Encoding.ASCII.GetBytes("qqmusic_key=");
    private static readonly byte[] CacheAscii = Encoding.ASCII.GetBytes("QQMusicCache");
    private static readonly byte[] CacheUnicode = Encoding.Unicode.GetBytes("QQMusicCache");

    private static bool IsReadable(uint protect) {
        if ((protect & 0x100) != 0 || (protect & 0x01) != 0) return false;
        uint basic = protect & 0xFF;
        return basic == 0x02 || basic == 0x04 || basic == 0x20 || basic == 0x40;
    }

    private static int IndexOf(byte[] data, int length, byte[] needle) {
        if (needle.Length == 0 || length < needle.Length) return -1;
        for (int i = 0; i <= length - needle.Length; i++) {
            bool match = true;
            for (int j = 0; j < needle.Length; j++) {
                if (data[i + j] != needle[j]) { match = false; break; }
            }
            if (match) return i;
        }
        return -1;
    }

    private static string ExtractCookie(byte[] data, int length, int start) {
        int end = Math.Min(length, start + 2048);
        for (int i = start; i < end; i++) {
            if (data[i] == 0 || data[i] == 10 || data[i] == 13) { end = i; break; }
        }
        return Encoding.UTF8.GetString(data, start, Math.Max(0, end - start)).Trim();
    }

    private static void AddPathCandidate(List<string> paths, string value) {
        if (String.IsNullOrWhiteSpace(value)) return;
        Match match = Regex.Match(value, @"[A-Za-z]:\\[^\x00\r\n\""<>|?*]*?QQMusicCache", RegexOptions.IgnoreCase);
        if (!match.Success) return;
        string candidate = match.Value.Trim(' ', '\"', '\'');
        if (!paths.Contains(candidate, StringComparer.OrdinalIgnoreCase)) paths.Add(candidate);
    }

    private static void FindCachePaths(byte[] data, int length, List<string> paths) {
        int asciiAt = IndexOf(data, length, CacheAscii);
        if (asciiAt >= 0) {
            int start = asciiAt;
            int lower = Math.Max(0, asciiAt - 1024);
            while (start > lower && data[start - 1] != 0 && data[start - 1] != 10 && data[start - 1] != 13) start--;
            int end = Math.Min(length, asciiAt + CacheAscii.Length + 8);
            AddPathCandidate(paths, Encoding.UTF8.GetString(data, start, end - start));
        }

        int unicodeAt = IndexOf(data, length, CacheUnicode);
        if (unicodeAt >= 0) {
            int start = unicodeAt - (unicodeAt % 2);
            int lower = Math.Max(0, start - 2048);
            while (start - 2 >= lower && !(data[start - 2] == 0 && data[start - 1] == 0)) start -= 2;
            int end = Math.Min(length - (length % 2), unicodeAt + CacheUnicode.Length + 16);
            AddPathCandidate(paths, Encoding.Unicode.GetString(data, start, Math.Max(0, end - start)));
        }
    }

    public static QQMusicSessionResult Read() {
        QQMusicSessionResult result = new QQMusicSessionResult();
        Process[] processes = Process.GetProcessesByName("QQMusic");
        if (processes.Length == 0) {
            result.Error = "QQMUSIC_NOT_RUNNING";
            return result;
        }

        IntPtr handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, processes[0].Id);
        if (handle == IntPtr.Zero) {
            result.Error = "QQMUSIC_ACCESS_DENIED";
            return result;
        }

        try {
            long address = 0;
            int infoSize = Marshal.SizeOf(typeof(MEMORY_BASIC_INFORMATION));
            MEMORY_BASIC_INFORMATION info;
            while (address >= 0 && address < Int64.MaxValue &&
                   VirtualQueryEx(handle, new IntPtr(address), out info, infoSize) != 0) {
                long baseAddress = info.BaseAddress.ToInt64();
                ulong regionUnsigned = info.RegionSize.ToUInt64();
                long regionSize = regionUnsigned > Int64.MaxValue ? 0 : (long)regionUnsigned;
                if (regionSize <= 0) break;

                if (info.State == MEM_COMMIT && IsReadable(info.Protect) &&
                    regionSize >= 4096 && regionSize <= 64L * 1024 * 1024) {
                    byte[] buffer = new byte[regionSize];
                    UIntPtr bytesRead;
                    if (ReadProcessMemory(handle, info.BaseAddress, buffer, (UIntPtr)regionSize, out bytesRead)) {
                        int length = (int)Math.Min((ulong)buffer.Length, bytesRead.ToUInt64());
                        if (String.IsNullOrEmpty(result.Cookie)) {
                            int cookieAt = IndexOf(buffer, length, CookieMarker);
                            if (cookieAt >= 0) result.Cookie = ExtractCookie(buffer, length, cookieAt);
                        }
                        if (result.CachePaths.Count < 8) FindCachePaths(buffer, length, result.CachePaths);
                    }
                }

                long next = baseAddress + regionSize;
                if (next <= address) break;
                address = next;
                if (!String.IsNullOrEmpty(result.Cookie) && result.CachePaths.Count > 0) break;
            }
        } finally {
            CloseHandle(handle);
        }

        if (String.IsNullOrEmpty(result.Cookie)) {
            result.Error = "QQMUSIC_NOT_LOGGED_IN";
            return result;
        }
        Match uin = Regex.Match(result.Cookie, @"(?:^|;\s*)qqmusic_uin=(\d+)");
        if (!uin.Success) {
            result.Error = "QQMUSIC_SESSION_INVALID";
            result.Cookie = "";
            return result;
        }
        result.Uin = uin.Groups[1].Value;
        return result;
    }
}
'@

$result = [QQMusicMemoryReader]::Read()
if ($result.Error) {
    [pscustomobject]@{
        ok = $false
        error = $result.Error
        cachePaths = @($result.CachePaths)
    } | ConvertTo-Json -Compress
    exit 2
}

[pscustomobject]@{
    ok = $true
    cookie = $result.Cookie
    uin = $result.Uin
    cachePaths = @($result.CachePaths)
} | ConvertTo-Json -Compress
