'use client'
import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import BentoCard from './bento-card';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';
import tus from 'tus-js-client';
import SparkMD5 from 'spark-md5';
import { Upload } from 'tus-js-client';

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
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
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

        analyser.getByteTimeDomainData(dataArray);

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
    setChunkStatus(statusArr as never[]);
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
          // 使用tus-js-client上传分块
          await new Promise((resolve, reject) => {
            const upload = new Upload(file?.slice(chunk.start, chunk.end) ?? new Blob(), {
              endpoint: '/api/openai',
              headers: {
                'upload-chunk-index': chunk.index.toString(),
                'upload-file-md5': fileMd5,
                'upload-total-chunks': totalChunks.toString(),
                'upload-filename': file?.name ?? 'untitled'
              },
              chunkSize,
              onError: function (error) {
                newStatusArr[chunk.index] = 'error';
                setChunkStatus([...newStatusArr]);
                reject(error);
              },
              onSuccess: function () {
                newStatusArr[chunk.index] = 'success';
                setChunkStatus([...newStatusArr]);
                resolve(void 0);
              }
            });
            upload.start();
          });
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
          const response = await fetch('/api/openai', {
            method: 'POST',
            body: JSON.stringify({ fileMd5, action: 'merge' }),
            headers: { 'Content-Type': 'application/json' }
          });
          const result = await response.json();
          setTranscription(result.text);
          setJsonResponse(result);
        } catch (error) {
          setError(error instanceof Error ? error.message : String(error));
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
                className="w-full absolute top-1/2 -translate-y-1/2 appearance-none bg-transparent [&::-webkit-slider-runnable-track]:rounded-lg [&::-webkit-slider-runnable-track]:bg-black/25 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500"
              />
            </div>
            <div className="flex items-center space-x-4 mt-2">
              <button onClick={togglePlayPause} className="text-2xl">
                {isPlaying ? <FaPause /> : <FaPlay />}
              </button>
              <div className="flex items-center space-x-2">
                <button onClick={toggleMute} className="text-xl">
                  {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-24"
                />
              </div>
            </div>
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={loading || !file}
          className="px-6 py-2 rounded-full bg-gradient-to-r from-[#F3F0D1] to-[#275252] text-white font-semibold shadow-lg hover:scale-105 transition-transform duration-300 disabled:opacity-50"
        >
          {loading ? '正在识别中...' : '上传并识别'}
        </button>
        {transcription && (
          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-full">
            <h3 className="font-semibold">识别结果:</h3>
            <p>{transcription}</p>
          </div>
        )}
        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg w-full">
            <h3 className="font-semibold">错误:</h3>
            <p>{error}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {chunks.map((chunk, idx) => (
          <div
            key={chunk.index}
            style={{ width: 16, height: 16, borderRadius: 2, background: chunkStatus[idx] === 'pending' ? '#ccc' : chunkStatus[idx] === 'success' ? '#4caf50' : '#f44336', cursor: chunkStatus[idx] === 'error' ? 'pointer' : 'default' }}
            title={`Chunk ${chunk.index}`}
            onClick={() => {
              if (chunkStatus[idx] === 'error') {
                // 失败重传
                handleUpload();
              }
            }}
          />
        ))}
      </div>
    </BentoCard>
  );
};

export default ASRCard;