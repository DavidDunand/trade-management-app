import "./globals.css";

export const metadata = {
  title: "Valeur Paris",
  description: "Internal trade management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-black">{children}</body>
    </html>
  );
}
