
import sys

def trace_structure(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    stack = []
    
    i = 0
    length = len(content)
    line_num = 1
    
    last_brace_closed_start_line = -1

    while i < length:
        char = content[i]
        
        if char == '\n':
            line_num += 1
            i += 1
            continue

        # Skip Comments
        if char == '/' and i + 1 < length:
            if content[i+1] == '/': 
                while i < length and content[i] != '\n': i += 1
                continue
            elif content[i+1] == '*':
                i += 2
                while i + 1 < length and not (content[i] == '*' and content[i+1] == '/'):
                    if content[i] == '\n': line_num += 1
                    i += 1
                i += 1
                continue

        # Skip Strings
        if char in ["'", '"', '`']:
            quote = char
            i += 1
            while i < length:
                if content[i] == '\n': line_num += 1
                if content[i] == '\\': i += 2; continue
                if content[i] == quote: break
                i += 1
            i += 1
            continue

        # Check Braces
        if char == '{':
            stack.append(line_num)
        elif char == '}':
            if stack:
                last_brace_closed_start_line = stack.pop()
            else:
                print(f"Error: Unexpected }} at {line_num}")
                return
        
        i += 1

    if stack:
        print(f"Error: Unclosed {{ starting at line {stack[-1]}")
        print(f"Total unclosed blocks: {len(stack)}")
        print(f"The LAST }} in the file closed the block starting at line: {last_brace_closed_start_line}")
        print("Stack trace of remaining start lines:", stack)
    else:
        print("Structure balanced.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        trace_structure(sys.argv[1])
