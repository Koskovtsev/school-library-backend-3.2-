// $(".auth").click(async function (event) {
//   event.preventDefault();
//   const modalHTML = `
//   <div class="modal fade" tabindex="-1" role="dialog" id="modalTour">
//     <div class="modal-dialog" role="document">
//       <div class="modal-content" style="border-radius: 12px; padding: 20px;">
//         <div class="modal-body">
//           <form id="authForm">
//             <div class="form-group">
//               <label for="authLogin">Login</label>
//               <input type="text" class="form-control" id="authLogin">
//             </div>
//             <div class="form-group">
//               <label for="authPassword">Password</label>
//               <input type="password" class="form-control" id="authPassword">
//             </div>
//             <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">Увійти</button>
//             <button type="button" class="btn btn-default btn-lg" style="width: 100%; margin-top: 10px;" data-dismiss="modal">Закрити</button>
//           </form>
//         </div>
//       </div>
//     </div>
//   </div>`;

//   $("#modalTour").remove();
//   $(".modal-backdrop").remove();
//   $("body").append(modalHTML);

//   const $modal = $("#modalTour");

//   function closeModal() {
//     $modal.removeClass("in").hide();
//     $(".modal-backdrop").remove();
//     $("body").removeClass("modal-open");
//     $modal.remove();
//   }

//   $modal.show().addClass("in");
//   $("body")
//     .addClass("modal-open")
//     .append('<div class="modal-backdrop fade in"></div>');

//   // Закриття по кнопці
//   $modal.find('[data-dismiss="modal"]').on("click", closeModal);

//   // Закриття по кліку на фон (поза вікном модалки)
//   $modal.on("click", function (e) {
//     if (e.target === this) closeModal();
//   });

//   // Сабміт форми
//   $modal.find("#authForm").on("submit", function (e) {
//     e.preventDefault();
//     const login = $("#authLogin").val();
//     const password = $("#authPassword").val();
//     console.log("Логін:", login, password);
//     if (login === "admin" && password === "admin") {
//       const params = new URLSearchParams({ admin: "1", login, password });
//       window.location.href = `/?${params}`;
//     } else {
//       closeModal();
//       alert("Такого користувача немає");
//     }
//   });
// });
