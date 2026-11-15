#!/bin/zsh
# GoDEX EZ-2 printer transport: macOS system tools only.
# Arguments: /dev/cu.*  raster-packet.bin  copies  first-in-batch(0|1)  interval-seconds
# Protocol parameters are for the physically tested 58x38mm / 2mm-gap stock.
set -euo pipefail

if (( $# != 5 )); then
  print -u2 "usage: printer.sh PORT PACKET COPIES FIRST DELAY"
  exit 2
fi

PORT="$1"
PACKET="$2"
integer COPIES="$3"
FIRST="$4"
DELAY="$5"

[[ "$PORT" == /dev/cu.* && -c "$PORT" ]] || { print -u2 "Invalid serial port"; exit 2; }
[[ -f "$PACKET" && -s "$PACKET" ]] || { print -u2 "Missing raster packet"; exit 2; }
(( COPIES >= 1 && COPIES <= 200 )) || { print -u2 "Invalid copies"; exit 2; }
[[ "$FIRST" == "0" || "$FIRST" == "1" ]] || { print -u2 "Invalid FIRST"; exit 2; }
[[ "$DELAY" =~ '^[0-9]+([.][0-9]+)?$' ]] || { print -u2 "Invalid delay"; exit 2; }

integer opened=0
close_port() {
  if (( opened )); then
    exec 3>&-
    exec 3<&-
    opened=0
  fi
}
TRAPEXIT() { close_port }
TRAPINT() { close_port; exit 130 }
TRAPTERM() { close_port; exit 143 }

open_port() {
  exec 3<>"$PORT"
  opened=1
  # OS-native 9600 8N1, no RTS/CTS or XON/XOFF. No external packages.
  /bin/stty 9600 cs8 -parenb -cstopb -ixon -ixoff -crtscts raw -echo <&3
}

# Initial alignment. This ASCII buffered packet is already physically verified.
if [[ "$FIRST" == "1" ]]; then
  open_port
  printf '\033F0\033q040\033M01\033B\033A11T3\r\033E\033P01' >&3
  /bin/sleep "$DELAY"
  close_port
  print "T3 sent"
fi

# Original working Line Mode: F0/q040/M01 then ESC Gnn binary rows + FF.
# Keep the same descriptor open across all copies within this job.
open_port
printf '\033F0\033q040\033M01' >&3
integer i=1
while (( i <= COPIES )); do
  /bin/cat "$PACKET" >&3
  /bin/sleep "$DELAY"
  print "copy $i/$COPIES sent"
  (( i += 1 ))
done
close_port

# Physically verified alone: a blank buffered label advances the roll by
# one sensor-positioned label. Do not use unverified ESC f or reverse commands.
open_port
printf '\033F0\033q040\033M01\033B\033A11 \r\033E\033P01' >&3
/bin/sleep "$DELAY"
close_port
print "blank separator sent; physical result not acknowledged"
