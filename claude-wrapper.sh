#!/bin/bash
# Claude Code Wrapper Script with pseudo-TTY and file-based output

export HOME=/root
export PATH="/usr/local/bin:$PATH"
export USER=root
export TERM=xterm-256color

# Create a temp file for output
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

# Build properly quoted command
QUOTED_ARGS=""
for arg in "$@"; do
    # Escape single quotes in the argument and wrap in single quotes
    escaped_arg=$(printf '%s' "$arg" | sed "s/'/'\\\\''/g")
    QUOTED_ARGS="$QUOTED_ARGS '$escaped_arg'"
done

# Run claude with script for pseudo-TTY (using the original binary)
script -q /dev/null -c "/root/.local/bin/claude $QUOTED_ARGS" > "$TMPFILE" 2>&1

# Clean and output the result
cat "$TMPFILE" | tr -d '\r' | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g; s/\x1b\[[?][0-9]*[a-zA-Z]//g; s/\x1b\[<u//g'