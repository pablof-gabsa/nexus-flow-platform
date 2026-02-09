import zlib
import struct

def make_png(width, height, color):
    # RGB color
    r, g, b = color
    
    # Raw data: 3 bytes per pixel (RGB)
    # Each scanline must be prepended by a filter byte (0)
    line_data = b'\x00' + bytes([r, g, b]) * width
    raw_data = line_data * height
    
    # IDAT chunk
    compressed_data = zlib.compress(raw_data)
    idat = b'IDAT' + compressed_data
    idat_crc = zlib.crc32(idat)
    
    # IHDR chunk
    # Width, Height, Bit depth (8), Color type (2=RGB), Compression (0), Filter (0), Interlace (0)
    ihdr_content = struct.pack('!IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = b'IHDR' + ihdr_content
    ihdr_crc = zlib.crc32(ihdr)
    
    # IEND chunk
    iend = b'IEND'
    iend_crc = zlib.crc32(iend)
    
    # Combine all
    params = [
        b'\x89PNG\r\n\x1a\n',
        struct.pack('!I', len(ihdr_content)), ihdr, struct.pack('!I', ihdr_crc),
        struct.pack('!I', len(compressed_data)), idat, struct.pack('!I', idat_crc),
        struct.pack('!I', 0), iend, struct.pack('!I', iend_crc)
    ]
    
    return b''.join(params)

# Generate 512x512 Blue Icon
png_data = make_png(512, 512, (37, 99, 235)) # #2563EB

with open('assets/icon_pwa.png', 'wb') as f:
    f.write(png_data)

print("Icon created: assets/icon_pwa.png")
