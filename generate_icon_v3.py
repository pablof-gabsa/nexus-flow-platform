import zlib
import struct

def make_v3_icon(width, height, bg_color, text_color):
    br, bg, bb = bg_color
    tr, tg, tb = text_color
    
    raw_data = b''
    for y in range(height):
        row_pixels = []
        for x in range(width):
            nx, ny = x/width, y/height
            
            # Design: Large "N"
            is_white = False
            
            # Vertical bars
            if 0.20 <= nx <= 0.35: is_white = True # Left
            elif 0.65 <= nx <= 0.80: is_white = True # Right
            
            # Diagonal: Connects Top-Left (0.20, 0.20) to Bottom-Right (0.80, 0.80)
            # Use a slightly wider band for diagonal
            # Line eq: y = x. Distance logic |x-y| < thickness
            elif 0.20 <= ny <= 0.80 and abs(nx - ny) < 0.08: is_white = True
            
            # Crop top and bottom to make it look like letters
            if ny < 0.20 or ny > 0.80: is_white = False

            if is_white:
                row_pixels.extend([tr, tg, tb])
            else:
                row_pixels.extend([br, bg, bb])
        
        raw_data += b'\x00' + bytes(row_pixels)

    compressed = zlib.compress(raw_data)
    
    ihdr_content = struct.pack('!IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = b'IHDR' + ihdr_content
    ihdr_crc = zlib.crc32(ihdr)
    
    idat = b'IDAT' + compressed
    idat_crc = zlib.crc32(idat)
    
    iend = b'IEND'
    iend_crc = zlib.crc32(iend)
    
    return b'\x89PNG\r\n\x1a\n' + \
           struct.pack('!I', len(ihdr_content)) + ihdr + struct.pack('!I', ihdr_crc) + \
           struct.pack('!I', len(compressed)) + idat + struct.pack('!I', idat_crc) + \
           struct.pack('!I', 0) + iend + struct.pack('!I', iend_crc)

# Generate V3: Blue #2563EB (37, 99, 235) with White N
png_data = make_v3_icon(512, 512, (37, 99, 235), (255, 255, 255))

with open('assets/nexus_logo_v3.png', 'wb') as f:
    f.write(png_data)

print("Icon created: assets/nexus_logo_v3.png")
