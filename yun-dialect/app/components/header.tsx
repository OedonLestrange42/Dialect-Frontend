import React from "react";

const Header = () => {
  return (
    <header className="p-4 text-center">
      <h1 className="text-4xl font-bold bg-gradient-to-r from-[#F3F0D1] to-[#275752] text-transparent bg-clip-text">
        Yun Dialect
      </h1>
      <p className="text-neutral-500 dark:text-neutral-400 mt-2">
        上传音频文件，即刻获得精准、高效的语音转文字服务
      </p>
    </header>
  );
};

export default Header;