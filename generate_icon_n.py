import zlib
import struct

def make_png_with_n(width, height, bg_color, text_color):
    # Flatten colors
    br, bg, bb = bg_color
    tr, tg, tb = text_color
    
    # Create pixel data
    # We will draw a simple "N" shape
    # N shape: Left vertical, Diagonal, Right vertical
    
    raw_data = b''
    for y in range(height):
        row_pixels = []
        for x in range(width):
            # Check if pixel is part of "N"
            # Normalize coordinates 0..1
            nx, ny = x/width, y/height
            
            # Margins: 0.2 to 0.8
            is_n = False
            if 0.2 <= nx <= 0.8 and 0.2 <= ny <= 0.8:
                # Left bar (0.2 - 0.3)
                if 0.2 <= nx <= 0.3: is_n = True
                # Right bar (0.7 - 0.8)
                elif 0.7 <= nx <= 0.8: is_n = True
                # Diagonal (nx approx ny)
                elif abs(nx - ny) < 0.08: is_n = True
            
            if is_n:
                row_pixels.extend([tr, tg, tb])
            else:
                row_pixels.extend([br, bg, bb])
        
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

# Generate 512x512 Blue Icon with White N
# Blue: #2563EB -> (37, 99, 235)
# White: (255, 255, 255)
png_data = make_png_with_n(512, 512, (37, 99, 235), (255, 255, 255))

with open('assets/icon_pwa.png', 'wb') as f:
    f.write(png_data)

print("Icon created with 'N': assets/icon_pwa.png")
