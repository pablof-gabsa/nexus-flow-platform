import zlib
import struct

def make_final_icon(width, height, bg_color, text_color):
    # Flatten colors
    br, bg, bb = bg_color
    tr, tg, tb = text_color
    
    raw_data = b''
    for y in range(height):
        row_pixels = []
        for x in range(width):
            # Normalize coordinates 0..1
            nx, ny = x/width, y/height
            
            is_white = False
            
            # Draw a thick white border (optional, let's keep it simple: just the N)
            # Draw N
            # Margin 15%
            if 0.15 <= nx <= 0.85 and 0.15 <= ny <= 0.85:
                # Left vertical bar (width 15%)
                if 0.15 <= nx <= 0.30: is_white = True
                # Right vertical bar (width 15%)
                elif 0.70 <= nx <= 0.85: is_white = True
                # Diagonal
                # Equation: x = y (roughly)
                # We want a diagonal from top-left of the inner box to bottom-right
                # Inner box width = 0.7
                # We want the diagonal to connect (0.15, 0.15) to (0.85, 0.85)
                # Distance from line y = x should be small
                elif abs(nx - ny) < 0.08: is_white = True
            
            if is_white:
                row_pixels.extend([tr, tg, tb]) # White
            else:
                row_pixels.extend([br, bg, bb]) # Blue
        
        # Add filter byte 0
        raw_data += b'\x00' + bytes(row_pixels)

    # Compress
    compressed = zlib.compress(raw_data)
    
    # Chunks
    # IHDR
    ihdr_content = struct.pack('!IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = b'IHDR' + ihdr_content
    ihdr_crc = zlib.crc32(ihdr)
    
    # IDAT
    idat = b'IDAT' + compressed
    idat_crc = zlib.crc32(idat)
    
    # IEND
    iend = b'IEND'
    iend_crc = zlib.crc32(iend)
    
    return b'\x89PNG\r\n\x1a\n' + \
           struct.pack('!I', len(ihdr_content)) + ihdr + struct.pack('!I', ihdr_crc) + \
           struct.pack('!I', len(compressed)) + idat + struct.pack('!I', idat_crc) + \
           struct.pack('!I', 0) + iend + struct.pack('!I', iend_crc)

# Generate 512x512 Blue Icon with Thicker White N
png_data = make_final_icon(512, 512, (37, 99, 235), (255, 255, 255))

with open('assets/nexus_logo_v2.png', 'wb') as f:
    f.write(png_data)

print("Icon created: assets/nexus_logo_v2.png")
