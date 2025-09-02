'use client'
import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import BentoCard from './bento-card';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';
// removed: import tus from 'tus-js-client';
import SparkMD5 from 'spark-md5';
// removed: import { Upload } from 'tus-js-client';

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
  const [isMerging, setIsMerging] = useState(false); // 新增：合并与识别中
  const { setJsonResponse } = useASRContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [chunks, setChunks] = useState<{ index: number; start: number; end: number; status: string; retry: number }[]>([]);
  const [chunkStatus, setChunkStatus] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setupAudioContext = () => {
      if (audioContextRef.current) return;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaElementSource(audio);

      source.connect(analyser);
      analyser.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      // For time domain data, Uint8Array length should be analyser.fftSize. Cast to satisfy libs expecting ArrayBuffer.
      dataArrayRef.current = (new Uint8Array(new ArrayBuffer(analyser.fftSize)) as unknown as Uint8Array<ArrayBuffer>);
    };

    const draw = () => {
      const analyser = analyserRef.current;
      const canvas = canvasRef.current;
      const canvasCtx = canvas?.getContext('2d');
      const dataArray = dataArrayRef.current;

      if (!analyser || !canvas || !canvasCtx || !dataArray) {
        return;
      }

      // 设置canvas尺寸
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      }

      const drawVisualizer = () => {
        animationFrameIdRef.current = requestAnimationFrame(drawVisualizer);

        // Some DOM typings (or third-party) require Uint8Array<ArrayBuffer>
        analyser.getByteTimeDomainData((dataArray as unknown as Uint8Array<ArrayBuffer>));

        canvasCtx.fillStyle = 'rgb(243, 240, 209)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = 'rgb(39, 82, 82)';
        canvasCtx.beginPath();

        const sliceWidth = (canvas.width * 1.0) / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;

          if (i === 0) {
            canvasCtx.moveTo(x, y);
          } else {
            canvasCtx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
      };

      drawVisualizer();
    };

    const updateProgress = () => {
      if (audio && audio.duration && !isNaN(audio.duration)) {
        const currentProgress = (audio.currentTime / audio.duration) * 100;
        setProgress(currentProgress);
      }
    };

    const handlePlay = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      setIsPlaying(true);
      draw();
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };

    const handleLoadedMetadata = () => {
      console.log('Audio metadata loaded, duration:', audio.duration);
      if (file) {
        setupAudioContext();
      }
    };

    const handleCanPlay = () => {
      console.log('Audio can start playing');
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handlePause);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      
      // 清理blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [file]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const selectedFile = event.target.files[0];
      
      // 清理之前的blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      
      // 创建新的blob URL
      const newBlobUrl = URL.createObjectURL(selectedFile);
      blobUrlRef.current = newBlobUrl;
      
      setFile(selectedFile);
      setTranscription(null);
      setError(null);
      setProgress(0);
      setIsPlaying(false);
      
      if (audioRef.current) {
        audioRef.current.src = newBlobUrl;
        audioRef.current.load(); // 强制重新加载音频
        console.log('Audio source set to:', newBlobUrl);
      }
    }
  };

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (audio) {
      try {
        if (isPlaying) {
          audio.pause();
        } else {
          await audio.play();
        }
      } catch (error) {
        // 忽略AbortError，这通常发生在快速切换播放/暂停时
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Audio playback error:', error);
        }
      }
    }
  };

  const handleProgressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (audio && audio.duration && !isNaN(audio.duration)) {
      try {
        const newProgress = Number(event.target.value);
        const newTime = (newProgress / 100) * audio.duration;
        
        // 确保新时间在有效范围内
        if (newTime >= 0 && newTime <= audio.duration) {
          setProgress(newProgress);
          audio.currentTime = newTime;
        }
      } catch (error) {
        console.warn('Error updating audio progress:', error);
      }
    }
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (audio) {
      const newVolume = Number(event.target.value);
      setVolume(newVolume);
      audio.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (audio) {
      if (isMuted) {
        audio.volume = volume || 0.1;
        setIsMuted(false);
      } else {
        audio.volume = 0;
        setIsMuted(true);
      }
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
-    setChunkStatus(statusArr as never[]);
+    setChunkStatus(statusArr);
    // 计算文件MD5
    const blobSlice = File.prototype.slice;
    const spark = new SparkMD5.ArrayBuffer();
    let currentChunk = 0;
    function loadNext() {
      const reader = new FileReader();
      reader.onload = function (e) {
        if (e.target && e.target.result && typeof e.target.result !== "string") {
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
    <BentoCard className="col-span-1 md:col-span-2 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#F3F0D1]/50 to-[#275252]/50 backdrop-blur-lg">
      <h2 className="text-2xl font-semibold mb-4">开始语音识别</h2>
      <div className="flex flex-col items-center space-y-4 w-full">
        <input
          type="file"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
        />
        {file && blobUrlRef.current && (
          <div className="w-full p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <audio ref={audioRef} className="w-full hidden" crossOrigin="anonymous" />
            <div className="relative h-20 w-full">
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full rounded-lg"
              />
              <input
                type="range"
                min="0"
                max="100"
                value={progress || 0}
                onChange={handleProgressChange}
              />
            </div>
            <div className="flex items-center justify-between mt-4">
              <button onClick={togglePlayPause} className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600">
                {isPlaying ? <FaPause /> : <FaPlay />}
              </button>
              <div className="flex items-center space-x-2">
                <FaVolumeMute className="text-gray-600" />
                <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={handleVolumeChange} />
                <FaVolumeUp className="text-gray-600" />
              </div>
            </div>
            <button onClick={handleUpload} className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50" disabled={loading || isMerging}>
              {loading ? '正在上传分块...' : isMerging ? '正在识别...' : '上传并识别'}
            </button>

            {/* 分块上传状态显示 */}
            {chunks.length > 0 && (
              <div className="mt-4 grid grid-cols-6 gap-1">
                {chunkStatus.map((s, i) => (
                  <div key={i} className={`h-2 rounded ${s === 'success' ? 'bg-green-500' : s === 'error' ? 'bg-red-500' : 'bg-gray-300'}`} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 识别中的遮罩层 */}
        {(isMerging) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-800 dark:text-gray-100">正在识别，请勿关闭页面...</p>
            </div>
          </div>
        )}

        {/* 识别结果或错误显示 */}
        {transcription && (
          <div className="mt-4 w-full p-4 bg-white dark:bg-gray-900 rounded-lg shadow">
            <h3 className="font-semibold mb-2">识别结果</h3>
            <p className="whitespace-pre-wrap break-words">{transcription}</p>
          </div>
        )}
        {error && (
          <div className="mt-4 w-full p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200 rounded-lg">
            <h3 className="font-semibold mb-2">出错了</h3>
            <p className="whitespace-pre-wrap break-words">{error}</p>
          </div>
        )}
      </div>
    </BentoCard>
  );
};

export default ASRCard;