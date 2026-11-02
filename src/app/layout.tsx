import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Xem View Video Fanpage Facebook',
  description: 'Thống kê và theo dõi lượt xem video đa Fanpage Facebook theo thời gian thực',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className="antialiased bg-[#090d16] text-slate-100">{children}</body>
    </html>
  );
}
