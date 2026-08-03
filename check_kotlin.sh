#!/bin/bash
echo "Checking Kotlin files for common issues..."
echo ""

for file in $(find modules -name "*.kt"); do
  echo "--- $file ---"

  # Check brace balance
  open=$(grep -o "{" "$file" | wc -l)
  close=$(grep -o "}" "$file" | wc -l)
  if [ "$open" != "$close" ]; then
    echo "⚠️  Brace mismatch: $open open, $close close"
  fi

  # Check paren balance
  popen=$(grep -o "(" "$file" | wc -l)
  pclose=$(grep -o ")" "$file" | wc -l)
  if [ "$popen" != "$pclose" ]; then
    echo "⚠️  Parenthesis mismatch: $popen open, $pclose close"
  fi

  # Flag bare early-return inside Function/AsyncFunction blocks (caused our last error)
  if grep -n "return@Function\|return@AsyncFunction" "$file" > /dev/null; then
    echo "⚠️  Contains 'return@Function' or 'return@AsyncFunction' — this can cause type mismatch errors in Expo's DSL. Consider using if-guards instead."
    grep -n "return@Function\|return@AsyncFunction" "$file"
  fi

  echo ""
done

echo "Check complete. This does NOT guarantee a successful build — it only catches common patterns we've seen fail."
