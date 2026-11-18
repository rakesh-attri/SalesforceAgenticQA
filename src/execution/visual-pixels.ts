import { inflateSync } from 'node:zlib';
// Bounded deterministic PNG reader for Chrome's RGB/RGBA screenshots. Unknown
// bit depths/interlacing are rejected; no image is silently resized or normalized.
export function decodeScreenshotPNG(bytes: Uint8Array) {
    const b = Buffer.from(bytes);
    if (b.length > 8388608 || b.length < 45 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw Error('Bounded PNG screenshot required');
    let offset = 8, width = 0, height = 0, channels = 0, ended = false;
    const chunks: Buffer[] = [];
    const crc = (data: Buffer) => { let c = 0xffffffff; for (const byte of data) {
        c ^= byte;
        for (let i = 0; i < 8; i++)
            c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    } return (c ^ 0xffffffff) >>> 0; };
    while (offset < b.length) {
        if (offset + 12 > b.length)
            throw Error('Truncated PNG');
        const length = b.readUInt32BE(offset), type = b.subarray(offset + 4, offset + 8).toString('ascii'), end = offset + 12 + length;
        if (end > b.length || length > 8388608 || crc(b.subarray(offset + 4, offset + 8 + length)) !== b.readUInt32BE(offset + 8 + length))
            throw Error('PNG chunk integrity failed');
        const data = b.subarray(offset + 8, offset + 8 + length);
        if (offset === 8 && type !== 'IHDR')
            throw Error('PNG header required');
        if (type === 'IHDR') {
            if (width || length !== 13)
                throw Error('PNG header differs');
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
            if (!width || !height || width * height > 4000000 || data[8] !== 8 || !channels || data[10] || data[11] || data[12])
                throw Error('Unsupported PNG format/budget');
        }
        else if (type === 'IDAT')
            chunks.push(data);
        else if (type === 'IEND') {
            if (length || end !== b.length)
                throw Error('Invalid PNG ending');
            ended = true;
            break;
        }
        else if (type[0] === type[0].toUpperCase() && !['PLTE'].includes(type))
            throw Error('Unsupported critical PNG chunk');
        offset = end;
    }
    if (!ended || !chunks.length)
        throw Error('Incomplete PNG');
    const stride = width * channels, raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
    if (raw.length !== (stride + 1) * height)
        throw Error('PNG raster size differs');
    const raster = Buffer.alloc(stride * height), pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        if (filter > 4)
            throw Error('Unknown PNG filter');
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? raster[y * stride + x - channels] : 0, b = y ? raster[(y - 1) * stride + x] : 0, c = y && x >= channels ? raster[(y - 1) * stride + x - channels] : 0, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c), predict = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            raster[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predict) & 255;
        }
    }
    for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < 3; c++)
            pixels[i * 4 + c] = raster[i * channels + c];
        pixels[i * 4 + 3] = channels === 4 ? raster[i * channels + 3] : 255;
    }
    return { width, height, pixels };
}
export type PixelRect = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
};
export function compareScreenshotPixels(left: ReturnType<typeof decodeScreenshotPNG>, right: ReturnType<typeof decodeScreenshotPNG>, input: {
    dynamic: PixelRect[];
    critical: PixelRect[];
    channelTolerance: number;
    maxChangedRatio: number;
}) {
    if (left.width !== right.width || left.height !== right.height)
        return { status: 'incompatible' as const, reason: 'Viewport/raster size changed; no resizing applied' };
    const { width, height } = left, inside = (r: PixelRect, x: number, y: number) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
    for (const r of [...input.dynamic, ...input.critical])
        if (!Number.isInteger(r.x) || !Number.isInteger(r.y) || !Number.isInteger(r.width) || !Number.isInteger(r.height) || r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1 || r.x + r.width > width || r.y + r.height > height)
            throw Error('Reviewed visual region outside screenshot');
    if (!Number.isInteger(input.channelTolerance) || input.channelTolerance < 0 || input.channelTolerance > 32 || !Number.isFinite(input.maxChangedRatio) || input.maxChangedRatio < 0 || input.maxChangedRatio > 0.05 || input.dynamic.length > 10 || input.dynamic.reduce((n, r) => n + r.width * r.height, 0) > width * height * 0.1)
        throw Error('Visual comparison tolerance/mask budget invalid');
    if (input.dynamic.some(a => input.critical.some(b => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y)))
        throw Error('Dynamic region cannot hide reviewed critical content');
    let changed = 0, ignored = 0, compared = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    const regions = new Map(input.critical.map(r => [r.id, 0]));
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4, different = [0, 1, 2, 3].some(c => Math.abs(left.pixels[i + c] - right.pixels[i + c]) > input.channelTolerance);
            if (input.dynamic.some(r => inside(r, x, y))) {
                if (different)
                    ignored++;
                continue;
            }
            compared++;
            if (!different)
                continue;
            changed++;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            for (const r of input.critical)
                if (inside(r, x, y))
                    regions.set(r.id, regions.get(r.id)! + 1);
        }
    const ratio = changed / Math.max(1, compared);
    return { status: ratio > input.maxChangedRatio || [...regions.values()].some(n => n > 0) ? 'review-required' as const : 'within-reviewed-tolerance' as const, changedPixels: changed, comparedPixels: compared, ignoredDynamicChanges: ignored, changedRatio: ratio, bounds: changed ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : undefined, critical: [...regions].map(([id, changedPixels]) => ({ id, changedPixels })), defectConfirmed: false, baselineUpdated: false };
}
