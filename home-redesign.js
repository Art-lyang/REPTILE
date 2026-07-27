const menuButton = document.querySelector(".menu-btn");
const mobileMenu = document.querySelector(".mobile-menu");

menuButton?.addEventListener("click", () => {
  const isOpen = mobileMenu.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "메뉴 닫기" : "메뉴 열기");
  menuButton.innerHTML = `<i class="bi bi-${isOpen ? "x-lg" : "list"}"></i>`;
});

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenu.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "메뉴 열기");
    menuButton.innerHTML = '<i class="bi bi-list"></i>';
  });
});

const parentA = document.querySelector("#mini-parent-a");
const parentB = document.querySelector("#mini-parent-b");
const donutValue = document.querySelector(".mini-donut b");

function updateMiniCalculator() {
  if (!donutValue) return;
  donutValue.textContent = parentA?.selectedIndex > 0 && parentB?.selectedIndex > 0 ? "25%" : "50%";
}

parentA?.addEventListener("change", updateMiniCalculator);
parentB?.addEventListener("change", updateMiniCalculator);
