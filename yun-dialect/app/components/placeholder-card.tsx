import React from 'react';
import BentoCard from './bento-card';

const PlaceholderCard = ({ className, title }: { className?: string, title: string }) => {
  return (
    <BentoCard className={className}>
      <div className="flex flex-col items-center justify-center h-full p-4">
        <h3 className="text-lg font-semibold text-neutral-600 dark:text-neutral-300">{title}</h3>
        <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-2">广告位</p>
      </div>
    </BentoCard>
  );
};

export default PlaceholderCard;