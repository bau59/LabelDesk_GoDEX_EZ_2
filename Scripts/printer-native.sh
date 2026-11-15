#!/bin/zsh
# Isolated original EZ-2 native font / CODE39 trial: ONE buffered label.
# No raster mode, no automatic startup T3, no extra blank separator.
# Same /bin/zsh, stty, cat as the tested standard printer transport.
set -euo pipefail
if (( $# != 5 )); then
  print -u2 "Usage: printer-native.sh PORT PACKET COPIES FIRST DELAY"
  exit 2
fi
PORT="$1"; PACKET="$2"; COPIES="$3"; FIRST="$4"; DELAY="$5"
[[ "$PORT" == /dev/cu.* && -c "$PORT" ]] || { print -u2 "Invalid serial port"; exit 2; }
[[ -f "$PACKET" && -s "$PACKET" ]] || { print -u2 "Missing packet"; exit 2; }
[[ "$COPIES" == "1" ]] || { print -u2 "Native trial is limited to a single label"; exit 2; }
[[ "$FIRST" == "0" ]] || { print -u2 "No extra startup label in native trial"; exit 2; }
[[ "$DELAY" =~ '^[0-9]+([.][0-9]+)?$' ]] || { print -u2 "Invalid delay"; exit 2; }
(( $(/usr/bin/stat -f%z "$PACKET") <= 512 )) || { print -u2 "Native packet too long"; exit 2; }
integer opened=0
close_port(){
  if (( opened )); then
    exec 3>&-
    exec 3<&-
    opened=0
  fi
}
TRAPEXIT(){ close_port }
TRAPINT(){ close_port; exit 130 }
TRAPTERM(){ close_port; exit 143 }
exec 3<>"$PORT";opened=1
/bin/stty 9600 cs8 -parenb -cstopb -ixon -ixoff -crtscts raw -echo <&3
/bin/cat "$PACKET" >&3
/bin/sleep "$DELAY"
close_port
print "One original-EZ-2 buffered label command sent. Actual print position not confirmed."
