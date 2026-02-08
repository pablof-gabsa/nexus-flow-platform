
import sys
import re

def check_structure(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    stack = []
    
    # Simple state machine to ignore strings and comments
    i = 0
    length = len(content)
    line_num = 1
    col_num = 1
    
    while i < length:
        char = content[i]
        
        # Track line/col
        if char == '\n':
            line_num += 1
            col_num = 0
        col_num += 1

        # Skip Comments
        if char == '/' and i + 1 < length:
            if content[i+1] == '/': # Single line
                # Skip until newline
                while i < length and content[i] != '\n':
                    i += 1
                line_num += 1
                col_num = 0
                i += 1
                continue
            elif content[i+1] == '*': # Multi line
                i += 2
                while i + 1 < length and not (content[i] == '*' and content[i+1] == '/'):
                    if content[i] == '\n':
                        line_num += 1
                        col_num = 0
                    i += 1
                i += 1 # Skip /
                continue

        # Skip Strings
        if char in ["'", '"', '`']:
            quote = char
            start_line = line_num
            start_col = col_num
            i += 1
            while i < length:
                if content[i] == '\n':
                    line_num += 1
                    col_num = 0
                else:
                    col_num += 1
                
                if content[i] == '\\': # Escape
                    i += 2
                    col_num += 1 # Approx
                    continue
                
                if content[i] == quote:
                    break
                i += 1
            i += 1
            continue

        # Check Braces
        if char in '{[(': 
            stack.append((char, line_num, col_num))
        elif char in '}])':
            if not stack:
                print(f"Error: Unexpected closing '{char}' at line {line_num}:{col_num}")
                return

            last, open_line, open_col = stack.pop()
            expected = {'{': '}', '[': ']', '(': ')'}[last]
            if char != expected:
                print(f"Error: Mismatched '{char}' at line {line_num}:{col_num}. Expected '{expected}' to close '{last}' from line {open_line}:{open_col}")
                return
        
        i += 1

    if stack:
        last, open_line, open_col = stack[-1]
        print(f"Error: Unclosed '{last}' at line {open_line}:{open_col}")
    else:
        print("Structure seems balanced.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        check_structure(sys.argv[1])
