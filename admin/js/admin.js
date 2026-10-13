const logoutBtn = document.getElementById("logoutBtn");

if(logoutBtn){

    logoutBtn.addEventListener("click",function(e){

        e.preventDefault();

        localStorage.removeItem("currentUser");

        alert("Admin Logged Out");

        window.location="../login.html";

    });

}