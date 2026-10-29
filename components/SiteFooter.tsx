import { MdEmail } from "react-icons/md";
import { FaDiscord } from "react-icons/fa";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="footer-credit">
        Made by Selma 💜
      </span>

      <span className="footer-divider">•</span>

      <span className="footer-inspired">
        Inspired by Papaplatte & Team
      </span>

      <span className="footer-divider">•</span>

      <div className="footer-links">
        <a
          href="mailto:whattheselma123@gmail.com"
          className="footer-icon"
          aria-label="E-Mail"
          title="E-Mail"
        >
          <MdEmail />
        </a>

        <a
          href="https://discord.com/users/945782785795301386"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-icon"
          aria-label="Discord"
          title="Discord"
        >
          <FaDiscord />
        </a>
      </div>
    </footer>
  );
}