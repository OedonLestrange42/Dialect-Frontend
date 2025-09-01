import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file found' }, { status: 400 });
    }

    // 从环境变量获取配置
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