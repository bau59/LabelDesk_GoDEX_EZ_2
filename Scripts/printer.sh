#!/bin/zsh
# GoDEX EZ-2S, 9600 8N1. Tested media: 58x38mm with a 2mm gap.
# --init PORT: set label pitch without printing or advancing the tape.
# PORT PACKET COPIES DELAY: send only the requested raster labels.
set -euo pipefail

if (( $# == 2 )) && [[ "$1" == "--init" ]]; then
  MODE="init"
  PORT="$2"
elif (( $# == 4 )); then
  MODE="print"
  PORT="$1"
  PACKET="$2"
  integer COPIES="$3"
  DELAY="$4"
else
  print -u2 "usage: printer.sh --init PORT | PORT PACKET COPIES DELAY"
  exit 2
fi

[[ "$PORT" == /dev/cu.* && -c "$PORT" ]] || { print -u2 "Invalid serial port"; exit 2; }
if [[ "$MODE" == "print" ]]; then
  [[ -f "$PACKET" && -s "$PACKET" ]] || { print -u2 "Missing raster packet"; exit 2; }
  (( COPIES >= 1 && COPIES <= 200 )) || { print -u2 "Invalid copies"; exit 2; }
  [[ "$DELAY" =~ '^[0-9]+([.][0-9]+)?$' ]] || { print -u2 "Invalid delay"; exit 2; }
fi

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
  /bin/stty 9600 cs8 -parenb -cstopb -ixon -ixoff -crtscts raw -echo <&3
}

open_port
if [[ "$MODE" == "init" ]]; then
  # Physically verified: after ESC q040, FEED finds the next label gap.
  # The setting is lost when the printer is powered off.
  printf '\033q040' >&3
  /bin/sleep 0.1  # Give the USB-RS232 adapter time to transmit before closing.
  print "ESC q040 sent; tape not advanced"
  exit 0
fi

# Protocol header for ESC Gnn raster printing; does not print an extra label.
printf '\033F0\033q040\033M01' >&3
integer i=1
while (( i <= COPIES )); do
  /bin/cat "$PACKET" >&3
  /bin/sleep "$DELAY"
  print "copy $i/$COPIES sent"
  (( i += 1 ))
done
close_port
print "Requested labels sent; physical output not acknowledged"
