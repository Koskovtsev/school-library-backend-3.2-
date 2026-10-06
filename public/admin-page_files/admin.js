document.addEventListener("DOMContentLoaded", () => {
  const headers = document.querySelectorAll(".books-table th.sortable");

  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const sortField = th.getAttribute("data-sort");
      const isAsc = th.classList.contains("asc");

      headers.forEach((header) => {
        header.classList.remove("asc", "desc");
        const icon = header.querySelector("i");
        if (icon) icon.className = "bi bi-arrow-down-up ms-1 text-white-50";
      });

      const icon = th.querySelector("i");
      if (isAsc) {
        th.classList.remove("asc");
        th.classList.add("desc");
        if (icon) icon.className = "bi bi-arrow-down ms-1 text-white";
      } else {
        th.classList.remove("desc");
        th.classList.add("asc");
        if (icon) icon.className = "bi bi-arrow-up ms-1 text-white";
      }

      // ТУТ ВИКЛИК СОРТУВАННЯ:
      // Варіант А: якщо сортуєш на бекенді -> змінюєш window.location.search і робиш запит
      // const direction = isAsc ? 'desc' : 'asc';
      // window.location.href = `/admin/books?sort=${sortField}&order=${direction}`;

      // Варіант Б: якщо сортуєш таблицю на клієнті в JS -> викликаєш функцію сортування рядків DOM
      // sortTableRows(sortField, isAsc ? 'desc' : 'asc');
    });
  });

  // const form = document.querySelector("#addBookForm");

  // form.addEventListener("submit", (event) => {
  //   event.preventDefault();
  // });

  const fileInput = document.getElementById("coverInput");
  const coverPreview = document.getElementById("coverPreview");
  const coverPathInput = document.getElementById("coverPathInput");

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("cover", file);
      console.log(`try to upload image.`);
      try {
        const response = (fgr = await fetch("/upload/image", {
          method: "POST",
          body: formData,
        }));

        const data = await response.json();

        if (data.success) {
          // 1. Підставляємо нову силку в прев'ю-картинку на формі
          coverPreview.src = data.filePath;

          // 2. Записуємо шлях у прихований інпут, який піде в базу даних при збереженні книги
          coverPathInput.value = data.filePath;
        } else {
          alert("Помилка завантаження файлу");
        }
      } catch (error) {
        console.error("Помилка:", error);
      }
    });
  }
});
