H=/tmp/claude-0/ui/home3; rm -rf $H; mkdir -p $H
cat > "$H/settings.json" <<J
{"moduleFolders":["/home/claude/testmods","/home/claude/esreal","/tmp/claude-0/libmods"],"openBibles":["tw:kjv.ont","es:a_001_b_wycliffe_1394_-_purvey_revision.bbli"],"ref":{"b":43,"c":3,"v":16},"dock":{"v":1,"zones":{"left":{"size":240,"groups":[{"panels":["tree"],"active":"tree","size":1}]},"right":{"size":560,"groups":[{"panels":["lib","cmt","study"],"active":"lib","size":1}]},"bottom":{"size":200,"groups":[{"panels":["search"],"active":"search","size":1}]}},"floats":[],"hidden":[]}}
J
cd "$(dirname "$(readlink -f "$0")")/../.."
ELECTRON_ENABLE_LOGGING=1 TIMOTHEOS_SCRIPT="$1" TIMOTHEOS_WAIT=${3:-4000} TIMOTHEOS_SCREENSHOT="$2" timeout 150 xvfb-run -a -s "-screen 0 1440x900x24" ./node_modules/.bin/electron --no-sandbox --user-data-dir=$H . 2>&1 | grep -iE "error|uncaught|fail|RESULT" | grep -viE "dbus|bus.cc|gpu|viz|vaapi|openssl" | head -40
