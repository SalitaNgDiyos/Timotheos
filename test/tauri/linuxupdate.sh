#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# Tests update_run on Linux with fake files: an AppImage is replaced and started again; a .deb goes through pkexec/apt-get (fakes
# in PATH that only record what they were asked) and Timotheos starts again. Nothing real is installed. Needs the debug build.
set -u
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"; W=/tmp/claude-0/updtest; rm -rf $W /tmp/download-updtest; mkdir -p $W/bin /tmp/download-updtest
fail=0; ck() { if [ "$1" = ok ]; then echo "✓ $2"; else echo "✗ $2"; fail=1; fi; }
run() { # run <file name> <env...>  -> prints what install() answered
  cat > $W/s.js <<J
(async () => { let how; try { how = await TimotheosHost.net.install('/tmp/download-updtest/$1'); } catch (e) { how = 'ERR ' + (e.message || e); } console.log('RESULT ' + how); })();
J
  env "${@:2}" bash $ROOT/test/tauri/run.sh $W/s.js $W/shot.png 1200 2>&1 | grep -a '^RESULT' | tail -1
}
# 1. an AppImage: replaced where it runs from, started again after the old one has closed
printf '#!/bin/sh\necho old > %s/ran\n' $W > $W/Timotheos.AppImage; chmod +x $W/Timotheos.AppImage
printf '#!/bin/sh\necho "new $APPDIR $MARK" > %s/ran-new\n' $W > /tmp/download-updtest/Timotheos_9.9.9_amd64.AppImage
r=$(run Timotheos_9.9.9_amd64.AppImage APPIMAGE=$W/Timotheos.AppImage APPDIR=/tmp/.mount_old MARK=$W/x:/tmp/.mount_old/bin:/usr/bin)
[ "$r" = "RESULT restarting" ] && ck ok "AppImage: answers restarting" || ck no "AppImage: answers restarting ($r)"
sleep 4
grep -q "^new  " $W/ran-new 2>/dev/null && ck ok "AppImage: the new file ran, with the old mount's variables removed ($(cat $W/ran-new))" || ck no "AppImage: the new file ran ($(cat $W/ran-new 2>&1))"
[ ! -e $W/Timotheos.AppImage.update ] && ck ok "AppImage: no leftover file" || ck no "AppImage: leftover file"
# 2. a .deb: asks for the password with pkexec, installs with apt-get, starts the installed program again
rm -f $W/ran-new
printf '#!/bin/sh\necho "pkexec $*" >> %s/log\nexec "$@"\n' $W > $W/bin/pkexec
printf '#!/bin/sh\necho "apt-get $*" >> %s/log\n' $W > $W/bin/apt-get
chmod +x $W/bin/*; : > /tmp/download-updtest/Timotheos_9.9.9_amd64.deb
r=$(run Timotheos_9.9.9_amd64.deb PATH=$W/bin:$PATH)
[ "$r" = "RESULT restarting" ] && ck ok ".deb: answers restarting" || ck no ".deb: answers restarting ($r)"
grep -q "apt-get install -y --allow-downgrades /tmp/download-updtest/Timotheos_9.9.9_amd64.deb" $W/log 2>/dev/null && ck ok ".deb: pkexec ran apt-get install on the file" || ck no ".deb: apt-get call ($(cat $W/log 2>&1))"
# 3. the password refused (pkexec exits 126): nothing installed, no restart
printf '#!/bin/sh\nexit 126\n' > $W/bin/pkexec
r=$(run Timotheos_9.9.9_amd64.deb PATH=$W/bin:$PATH)
[ "$r" = "RESULT cancelled" ] && ck ok ".deb: password refused: cancelled" || ck no ".deb: password refused ($r)"
# 4. the package tool fails: the reason is shown
printf '#!/bin/sh\necho "E: Unable to locate package" >&2\nexit 100\n' > $W/bin/pkexec
r=$(run Timotheos_9.9.9_amd64.deb PATH=$W/bin:$PATH)
echo "$r" | grep -q "The package tool said: E: Unable to locate package" && ck ok ".deb: a failure is reported with the tool's words" || ck no ".deb: failure ($r)"
# 5. not an AppImage run and no pkexec: the folder is shown as before
rm -f $W/bin/pkexec
r=$(run Timotheos_9.9.9_amd64.AppImage PATH=$W/bin:/usr/bin:/bin APPIMAGE=)
echo "$r" | grep -q "RESULT folder" && ck ok "an AppImage file when not run as one: the folder opens" || ck no "folder fallback ($r)"
exit $fail
