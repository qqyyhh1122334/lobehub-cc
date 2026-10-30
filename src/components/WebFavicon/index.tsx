import Image from '@/libs/next/Image';

interface WebFaviconProps {
  alt?: string;
  size?: number;
  title?: string;
  url: string;
}

const WebFavicon = ({ url, title, alt, size = 14 }: WebFaviconProps) => {
  return (
    <Image
      unoptimized
      alt={alt || title || url}
      height={size}
      src="/favicon.ico"
      style={{ borderRadius: 4 }}
      width={size}
    />
  );
};

export default WebFavicon;
