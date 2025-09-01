import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // 检查 Content-Type 是否为 tus 协议相关
    const contentType = req.headers.get('content-type') || '';
    if (contentType.startsWith('application/offset+octet-stream')) {
      // tus-js-client 分块上传处理
      // 直接将 chunk 数据转发到后端分块接口
      const chunkIndex = req.headers.get('upload-chunk-index');
      const fileMd5 = req.headers.get('upload-file-md5');
      const totalChunks = req.headers.get('upload-total-chunks');
      const filename = req.headers.get('upload-filename');
      const baseUrl = process.env.ASR_BASE_URL || 'http://localhost:8000';
      const apiKey = process.env.ASR_API_KEY || 'your-secret-api-key';
      const backendResponse = await fetch(`${baseUrl}/v1/audio/chunk`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'upload-chunk-index': chunkIndex || '',
          'upload-file-md5': fileMd5 || '',
          'upload-total-chunks': totalChunks || '',
          'upload-filename': filename || ''
        },
        body: req.body
      });
      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        return NextResponse.json({ error: `Backend chunk error: ${errorText}` }, { status: backendResponse.status });
      }
      return NextResponse.json({ success: true });
    }
    // 兼容原始整体文件上传
    const formContentType = req.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data') && !contentType.startsWith('application/x-www-form-urlencoded')) {
      return NextResponse.json({ error: 'Content-Type must be multipart/form-data or application/x-www-form-urlencoded' }, { status: 400 });
    }
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file found' }, { status: 400 });
    }
    const baseUrl = process.env.ASR_BASE_URL || 'http://localhost:8000';
    const apiKey = process.env.ASR_API_KEY || 'your-secret-api-key';
    const modelName = process.env.ASR_MODEL_NAME || 'paraformer-large';
    const responseFormat = process.env.ASR_RESPONSE_FORMAT || 'verbose_json';
    const backendFormData = new FormData();
    backendFormData.append('file', file);
    backendFormData.append('model', modelName);
    backendFormData.append('response_format', responseFormat);
    const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: backendFormData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Backend error: ${errorText}` }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in transcription API route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}