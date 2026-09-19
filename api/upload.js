const { configureCloudinary } = require('../_lib/cloudinary');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit, sanitizeError } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 20)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { file, folder, type } = req.body;
    if (!file) {
      return res.status(400).json({ error: { message: 'No file provided' } });
    }

    const isBase64 = file.startsWith('data:');
    const isUrl = file.startsWith('http://') || file.startsWith('https://');

    if (!isBase64 && !isUrl) {
      return res.status(400).json({ error: { message: 'File must be a base64 data URI or URL' } });
    }

    if (isBase64 && file.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: { message: 'File size exceeds limit' } });
    }

    const allowedFolders = ['trendaryo', 'products', 'avatars', 'reviews'];
    const uploadFolder = allowedFolders.includes(folder) ? folder : 'trendaryo';

    const cloudinary = configureCloudinary();
    const resourceType = type === 'video' ? 'video' : 'image';

    const uploadOptions = {
      folder: uploadFolder,
      resource_type: resourceType,
    };

    if (resourceType === 'image') {
      uploadOptions.transformation = [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' },
      ];
    }

    if (resourceType === 'video') {
      uploadOptions.eager = [
        { width: 640, crop: 'scale', format: 'mp4' },
      ];
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(file, uploadOptions, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    res.status(200).json({
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        duration: result.duration || null,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    const message = sanitizeError(error);
    const statusCode = error.http_code || 500;
    res.status(statusCode).json({ error: { message } });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
