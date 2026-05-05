import { useEffect } from "react";

const darkModeQuery = "(prefers-color-scheme: dark)";

function applyRootTheme(prefersDark: boolean) {
  const root = document.documentElement;

  root.classList.toggle("dark", prefersDark);
  root.style.colorScheme = prefersDark ? "dark" : "light";
}

export function SystemThemeSync() {
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      applyRootTheme(false);
      return;
    }

    const mediaQuery = window.matchMedia(darkModeQuery);
    const handleChange = (event: MediaQueryListEvent) => {
      applyRootTheme(event.matches);
    };

    applyRootTheme(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return null;
}
