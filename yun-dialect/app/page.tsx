import Header from './components/header';
import BentoGrid from './components/bento-grid';
import ASRCard, { ASRProvider } from './components/asr-card';
import JSONDisplayCard from './components/json-display-card';
import PlaceholderCard from './components/placeholder-card';

export default function Home() {
  return (
    <ASRProvider>
      <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center">
        <Header />
        <BentoGrid>
          <PlaceholderCard title="语音识别技术" />
          <PlaceholderCard title="产品优势" className="md:col-span-2" />
          <PlaceholderCard title="使用场景" />
          <PlaceholderCard title="客户案例" className="md:row-span-2" />
          <ASRCard />
          <JSONDisplayCard />
          <PlaceholderCard title="技术支持" />
          <PlaceholderCard title="新功能 1" />
          <PlaceholderCard title="新功能 2" />
          <PlaceholderCard title="新功能 3" className="md:col-span-2" />
        </BentoGrid>
      </main>
    </ASRProvider>
  );
}
