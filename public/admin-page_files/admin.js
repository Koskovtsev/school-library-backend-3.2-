document.addEventListener("DOMContentLoaded", () => {
  const headers = document.querySelectorAll(".books-table th.sortable");

  const params = new URLSearchParams(window.location.search);
  const currentSort = params.get("sort");
  const currentOrder = params.get("order");

  headers.forEach((th) => {
    const icon = th.querySelector("i");
    const field = th.getAttribute("data-sort");

    th.classList.remove("asc", "DESC");

    if (
      field === currentSort &&
      (currentOrder === "ASC" || currentOrder === "DESC")
    ) {
      th.classList.add(currentOrder);
      if (icon) {
        icon.className =
          currentOrder === "ASC"
            ? "bi bi-arrow-up ms-1 text-white"
            : "bi bi-arrow-down ms-1 text-white";
      }
    } else if (icon) {
      icon.className = "bi bi-arrow-down-up ms-1 text-white-50";
    }
  });

  // 3. Клік: рахуємо новий напрямок і переходимо на нову URL
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const sortField = th.getAttribute("data-sort");
      const isAsc = th.classList.contains("ASC");
      const direction = isAsc ? "DESC" : "ASC";

      // Беремо поточні параметри, щоб не губити admin/login/password тощо
      const newParams = new URLSearchParams(window.location.search);
      newParams.set("sort", sortField);
      newParams.set("order", direction);

      window.location.search = newParams.toString();
    });
  });
  // headers.forEach((th) => {
  //   th.addEventListener("click", () => {
  //     const sortField = th.getAttribute("data-sort");
  //     const isAsc = th.classList.contains("asc");

  //     headers.forEach((header) => {
  //       header.classList.remove("asc", "desc");
  //       const icon = header.querySelector("i");
  //       if (icon) {
  //         icon.className =
  //           currentOrder === "asc"
  //             ? "bi bi-arrow-up ms-1 text-white"
  //             : "bi bi-arrow-down ms-1 text-white";
  //       } else icon.className = "bi bi-arrow-down-up ms-1 text-white-50";
  //     });

  //     const icon = th.querySelector("i");
  //     if (isAsc) {
  //       th.classList.remove("asc");
  //       th.classList.add("desc");
  //       if (icon) icon.className = "bi bi-arrow-down ms-1 text-white";
  //     } else {
  //       th.classList.remove("desc");
  //       th.classList.add("asc");
  //       if (icon) icon.className = "bi bi-arrow-up ms-1 text-white";
  //     }
  //     const direction = isAsc ? "desc" : "asc";

  //     console.log(`вибрали сортування: ${direction}, sortField: ${sortField}.`);
  //     const href = `/?admin=1&login=admin&password=admin&sort=${sortField}&order=${direction}`;
  //     console.log(`herf = ${href}`);
  //     window.location.href = `/?admin=1&login=admin&password=admin&sort=${sortField}&order=${direction}`;
  //     // ТУТ ВИКЛИК СОРТУВАННЯ:
  //     // Варіант А: якщо сортуєш на бекенді -> змінюєш window.location.search і робиш запит
  //     // window.location.href = `/admin/books?sort=${sortField}&order=${direction}`;

  //     // Варіант Б: якщо сортуєш таблицю на клієнті в JS -> викликаєш функцію сортування рядків DOM
  //     // sortTableRows(sortField, isAsc ? 'desc' : 'asc');
  //   });
  // });

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
  const logoutBtn = document.getElementById("logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      console.log(`logout clicked`);
      window.location.href = `/`;
    });
  }
});
