"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachmentService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
class AttachmentService {
    static MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    static ALLOWED_EXTENSIONS = new Set([
        'jpg',
        'jpeg',
        'png',
        'webp',
        'pdf',
        'doc',
        'docx',
    ]);
    static PROHIBITED_EXTENSIONS = new Set([
        'exe',
        'bat',
        'sh',
        'apk',
        'dmg',
        'msi',
        'cmd',
        'vbs',
        'js',
        'ts',
        'py',
        'bin',
        'jar',
    ]);
    static ALLOWED_MIME_TYPES = new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    /**
     * Validates file upload against security policy
     */
    static validate(fileName, fileSize, mimeType) {
        if (!fileName || typeof fileName !== 'string') {
            return { isValid: false, error: 'Invalid file name' };
        }
        if (fileSize > this.MAX_FILE_SIZE) {
            return {
                isValid: false,
                error: `File size exceeds the 10 MB limit (${(fileSize / (1024 * 1024)).toFixed(1)} MB provided)`,
            };
        }
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        if (this.PROHIBITED_EXTENSIONS.has(ext)) {
            return {
                isValid: false,
                error: `Executable or script file type .${ext} is prohibited for security.`,
            };
        }
        if (!this.ALLOWED_EXTENSIONS.has(ext)) {
            return {
                isValid: false,
                error: `Unsupported file format .${ext}. Only JPG, PNG, WEBP, PDF, and DOC/DOCX files are supported.`,
            };
        }
        if (mimeType && !this.ALLOWED_MIME_TYPES.has(mimeType)) {
            return {
                isValid: false,
                error: `MIME type ${mimeType} is not permitted for chat attachments.`,
            };
        }
        const sanitizedBase = fileName
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .substring(0, 100);
        return {
            isValid: true,
            sanitizedFileName: sanitizedBase,
            fileType: ext.toUpperCase(),
            fileSize,
        };
    }
    /**
     * Saves uploaded base64 data to a secure attachment directory
     */
    static async saveBase64Attachment(fileName, base64Data) {
        // Extract base64 payload
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        const mimeType = matches ? matches[1] : 'application/octet-stream';
        const buffer = matches
            ? Buffer.from(matches[2], 'base64')
            : Buffer.from(base64Data, 'base64');
        const validation = this.validate(fileName, buffer.length, mimeType);
        if (!validation.isValid) {
            throw new Error(validation.error || 'Attachment validation failed');
        }
        const uploadsDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'chat-attachments');
        if (!fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.mkdirSync(uploadsDir, { recursive: true });
        }
        const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
        const uniqueFileName = `${(0, uuid_1.v4)()}.${ext}`;
        const targetPath = path_1.default.join(uploadsDir, uniqueFileName);
        await fs_1.default.promises.writeFile(targetPath, buffer);
        return {
            fileUrl: `/public/uploads/chat-attachments/${uniqueFileName}`,
            fileSize: buffer.length,
            fileType: ext.toUpperCase(),
        };
    }
}
exports.AttachmentService = AttachmentService;
