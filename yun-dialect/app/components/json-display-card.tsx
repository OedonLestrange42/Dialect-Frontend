'use client'
import React from 'react';
import BentoCard from './bento-card';
import { useASRContext } from './asr-card';

const JSONDisplayCard = () => {
  const { jsonResponse } = useASRContext();

  const formatJSONString = (obj: any): string => {
    if (!obj) return '';
    return JSON.stringify(obj, null, 2);
  };

  const renderJSONWithSyntaxHighlight = (jsonString: string) => {
    // 简单的语法高亮
    const lines = jsonString.split('\n');
    return lines.map((line, index) => {
      let coloredLine = line;
      
      // 高亮字符串值
      coloredLine = coloredLine.replace(/"([^"]*)"/g, (match, p1) => {
        if (line.includes(':')) {
          const colonIndex = line.indexOf(':');
          const matchIndex = line.indexOf(match);
          if (matchIndex < colonIndex) {
            // 这是一个键
            return `<span class="text-blue-600 font-medium">${match}</span>`;
          } else {
            // 这是一个字符串值
            return `<span class="text-green-600">${match}</span>`;
          }
        }
        return `<span class="text-green-600">${match}</span>`;
      });
      
      // 高亮数字
      coloredLine = coloredLine.replace(/: (\d+)/g, ': <span class="text-purple-600">$1</span>');
      
      // 高亮布尔值
      coloredLine = coloredLine.replace(/: (true|false)/g, ': <span class="text-orange-600">$1</span>');
      
      // 高亮括号和花括号
      coloredLine = coloredLine.replace(/([{}\[\]])/g, '<span class="text-gray-600">$1</span>');
      
      return (
        <div key={index} dangerouslySetInnerHTML={{ __html: coloredLine }} />
      );
    });
  };

  return (
    <BentoCard className="col-span-1 md:col-span-2 flex flex-col p-6 bg-gradient-to-br from-[#275252]/50 to-[#F3F0D1]/50 backdrop-blur-lg">
      <h2 className="text-2xl font-semibold mb-4 text-center">JSON 响应数据</h2>
      <div className="flex-1 overflow-auto">
        {jsonResponse ? (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 font-mono text-sm leading-relaxed border">
            <div className="whitespace-pre-wrap break-words">
              {renderJSONWithSyntaxHighlight(formatJSONString(jsonResponse))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">暂无数据</p>
              <p className="text-sm">请先上传音频文件并进行语音识别</p>
            </div>
          </div>
        )}
      </div>
    </BentoCard>
  );
};

export default JSONDisplayCard;