'use client'
import React, { useState, useEffect, createContext, useContext } from 'react';
import BentoCard from './bento-card';
import SparkMD5 from 'spark-md5';

// 创建Context来共享JSON数据
interface ASRContextType {
  jsonResponse: any;
  setJsonResponse: (data: any) => void;
}

const ASRContext = createContext<ASRContextType | null>(null);

export const useASRContext = () => {
  const context = useContext(ASRContext);
  if (!context) {
    throw new Error('useASRContext must be used within ASRProvider');
  }
  return context;
};

export const ASRProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jsonResponse, setJsonResponse] = useState<any>(null);
  
  return (
    <ASRContext.Provider value={{ jsonResponse, setJsonResponse }}>
      {children}
    </ASRContext.Provider>
  );
};

const ASRCard = () => {
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMerging, setIsMerging] = useState(false); // 合并与识别中
  const { setJsonResponse } = useASRContext();
  const [chunks, setChunks] = useState<{ index: number; start: number; end: number; status: string; retry: number }[]>([]);
  const [chunkStatus, setChunkStatus] = useState<string[]>([]);
  const [remoteUrl, setRemoteUrl] = useState<string>(''); // 新增：远程URL输入

  // 占位 effect（播放器已移除）
  useEffect(() => {
    return () => {};
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const selectedFile = event.target.files[0];
      setFile(selectedFile);
      setTranscription(null);
      setError(null);
      setLoading(false);
      setChunks([]);
      setChunkStatus([]);
    }
  };

  // 新增：从远程 URL 直接识别（由后端下载）
  const handleTranscribeFromUrl = async () => {
    if (!remoteUrl) {
      alert('请先输入一个URL');
      return;
    }
    setError(null);
    setTranscription(null);
    setLoading(true);
    try {
      const resp = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'from_url', url: remoteUrl, filename: undefined })
      });
      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        if (!resp.ok) {
          throw new Error(json?.error || '识别失败');
        }
        setTranscription(json.text);
        setJsonResponse(json);
      } catch (e) {
        throw new Error(text);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert('请先选择一个文件');
      return;
    }

    setLoading(true);
    setTranscription(null);
    setError(null);
    // 分块参数
    const chunkSize = 5 * 1024 * 1024; // 5MB
    const totalChunks = Math.ceil(file.size / chunkSize);
    let chunkArr: { index: number; start: number; end: number; status: string; retry: number }[] = [];
    let statusArr: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      chunkArr.push({
        index: i,
        start: i * chunkSize,
        end: Math.min((i + 1) * chunkSize, file.size),
        status: 'pending',
        retry: 0
      });
      statusArr.push('pending');
    }
    setChunks(chunkArr);
    setChunkStatus(statusArr);
    // 计算文件MD5
    const blobSlice = File.prototype.slice;
    const spark = new SparkMD5.ArrayBuffer();
    let currentChunk = 0;
    function loadNext() {
      const reader = new FileReader();
      reader.onload = function (e) {
        if (e.target && e.target.result && typeof e.target.result !== 'string') {
          spark.append(e.target.result as ArrayBuffer);
        }
        currentChunk++;
        if (currentChunk < totalChunks) {
          loadNext();
        } else {
          const fileMd5 = spark.end();
          uploadChunks(fileMd5);
        }
      };
      const chunk = blobSlice.call(file!, currentChunk * chunkSize, Math.min((currentChunk + 1) * chunkSize, file!.size));
      reader.readAsArrayBuffer(chunk);
    }
    loadNext();
    async function uploadChunks(fileMd5: string) {
      let newStatusArr = [...statusArr];
      for (let i = 0; i < chunkArr.length; i++) {
        const chunk = chunkArr[i];
        try {
          // 改为原生 fetch 逐块上传，避免 tus 协议握手带来的 400
          try {
            const res = await fetch('/api/openai', {
              method: 'POST',
              headers: {
                'content-type': 'application/offset+octet-stream',
                'upload-chunk-index': chunk.index.toString(),
                'upload-file-md5': fileMd5,
                'upload-total-chunks': totalChunks.toString(),
                'upload-filename': file?.name ?? 'untitled'
              },
              body: file?.slice(chunk.start, chunk.end) ?? new Blob()
            });
            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              throw new Error(`chunk ${chunk.index} upload failed: ${res.status} ${errText}`);
            }
            newStatusArr[chunk.index] = 'success';
            setChunkStatus([...newStatusArr]);
          } catch (error) {
            newStatusArr[chunk.index] = 'error';
            setChunkStatus([...newStatusArr]);
            throw error;
          }
        } catch (err) {
          // 错误处理
          newStatusArr[chunk.index] = 'error';
          setChunkStatus([...newStatusArr]);
        }
      }
      setLoading(false);
      // 所有分块上传成功后可触发合并和识别
      if (newStatusArr.every(s => s === 'success')) {
        // 合并分块并识别
        try {
          setIsMerging(true); // 显示“正在识别”遮罩
          const response = await fetch('/api/openai', {
            method: 'POST',
            body: JSON.stringify({ fileMd5, action: 'merge', filename: file?.name ?? undefined }),
            headers: { 'Content-Type': 'application/json' }
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result?.error || '合并或识别失败');
          }
          setTranscription(result.text);
          setJsonResponse(result);
        } catch (error) {
          setError(error instanceof Error ? error.message : String(error));
        } finally {
          setIsMerging(false);
        }
      }
    }
  };

  return (
    <BentoCard className="col-span-1 md:col-span-2 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#F3F0D1]/50 to-[#275252]/50 backdrop-blur-lg max-h-[70vh] overflow-hidden">
      <h2 className="text-2xl font-semibold mb-4">开始语音识别</h2>
      <div className="flex flex-col items-center space-y-4 w-full">
        <input
          type="file"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
        />

        <button onClick={handleUpload} className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50" disabled={loading || isMerging || !file}>
          {loading ? '正在上传分块...' : isMerging ? '正在识别...' : '上传并识别'}
        </button>

        {/* 新增：从URL识别输入与按钮 */}
        <div className="w-full pt-2">
          <label className="block text-sm mb-1">或从 MinIO/远程 URL 识别：</label>
          <div className="flex gap-2 w-full">
            <input
              type="url"
              placeholder="https://your-minio/presigned/audio.wav"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <button
              onClick={handleTranscribeFromUrl}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              disabled={loading || isMerging || !remoteUrl}
            >
              {loading ? '正在请求...' : '从URL识别'}
            </button>
          </div>
        </div>

        {chunks.length > 0 && (
          <div className="mt-4 grid grid-cols-6 gap-1 w-full">
            {chunkStatus.map((s, i) => (
              <div key={i} className={`${s === 'success' ? 'bg-green-500' : s === 'error' ? 'bg-red-500' : 'bg-gray-300'} h-2 rounded`} />
            ))}
          </div>
        )}

        {/* 识别中的遮罩层 */}
        {isMerging && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-800 dark:text-gray-100">正在识别，请勿关闭页面...</p>
            </div>
          </div>
        )}

        {/* 识别结果或错误显示 */}
        {transcription && (
          <div className="mt-4 w-full bg-white dark:bg-gray-900 rounded-lg shadow max-h-[40vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="font-semibold">识别结果</h3>
            </div>
            <div className="p-4 overflow-y-auto">
              <p className="whitespace-pre-wrap break-words">{transcription}</p>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-4 w-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200 rounded-lg max-h-[40vh] flex flex-col">
            <div className="p-4 border-b border-red-200/60 dark:border-red-800/60">
              <h3 className="font-semibold">出错了</h3>
            </div>
            <div className="p-4 overflow-y-auto">
              <p className="whitespace-pre-wrap break-words">{error}</p>
            </div>
          </div>
        )}
      </div>
    </BentoCard>
  );
};

export default ASRCard;