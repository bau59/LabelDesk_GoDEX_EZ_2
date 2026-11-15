#!/bin/zsh
# GoDEX EZ-2 (2002) buffered CP866 text/firmware barcode printing.
# Never mixes a buffered label with Gnn line graphics or extra feed labels.
# Arguments: PORT PACKET COPIES FIRST DELAY.
set -euo pipefail
if (( $# != 5 )); then
  print -u2 "Usage: printer-text.sh PORT PACKET COPIES FIRST DELAY"
  exit 2
fi
PORT="$1"; PACKET="$2"; COPIES="$3"; FIRST="$4"; DELAY="$5"
[[ "$PORT" == /dev/cu.* && -c "$PORT" ]] || { print -u2 "Invalid serial port"; exit 2; }
[[ -f "$PACKET" && -s "$PACKET" ]] || { print -u2 "Missing buffered packet"; exit 2; }
[[ "$COPIES" == <-> ]] || { print -u2 "Invalid copies"; exit 2; }
(( COPIES >= 1 && COPIES <= 200 )) || { print -u2 "Copies must be 1..200"; exit 2; }
[[ "$FIRST" == 0 ]] || { print -u2 "Text mode never triggers startup alignment/feed"; exit 2; }
[[ "$DELAY" =~ '^[0-9]+([.][0-9]+)?$' ]] || { print -u2 "Invalid delay"; exit 2; }
(( $(/usr/bin/stat -f%z "$PACKET") <= 8192 )) || { print -u2 "Buffered packet exceeds 8KB"; exit 2; }
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
exec 3<>"$PORT"
opened=1
/bin/stty 9600 cs8 -parenb -cstopb -ixon -ixoff -crtscts raw -echo <&3
/bin/cat "$PACKET" >&3
/bin/sleep "$DELAY"
close_port
print "Buffered CP866 job sent, copies=$COPIES. Printer output/paper position not acknowledged."
